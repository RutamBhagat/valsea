import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");

function requireEnvironmentValue(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set when Pulumi config does not provide it`);
  return value;
}

const project = gcpConfig.get("project") ?? requireEnvironmentValue("GCP_PROJECT_ID");
const region = gcpConfig.get("region") ?? "us-west1";
const zone = config.get("zone") ?? `${region}-b`;
const sshUsername = config.get("sshUsername") ?? "deploy";
const sshPublicKey = config.require("sshPublicKey");
const sshSourceRanges = config.getObject<string[]>("sshSourceRanges") ?? ["::/0"];

const enabledServices = ["compute.googleapis.com"];

const projectServices = enabledServices.map(
  (service) =>
    new gcp.projects.Service(`api-${service.split(".")[0]}`, {
      project,
      service,
      disableOnDestroy: false,
    }),
);

const network = new gcp.compute.Network(
  "network",
  {
    project,
    name: "valsea",
    autoCreateSubnetworks: false,
  },
  { dependsOn: projectServices },
);

const subnet = new gcp.compute.Subnetwork("subnet", {
  project,
  name: "valsea",
  network: network.id,
  region,
  stackType: "IPV6_ONLY",
  ipv6AccessType: "EXTERNAL",
});

new gcp.compute.Firewall("ssh", {
  project,
  name: "valsea-ssh",
  network: network.id,
  direction: "INGRESS",
  sourceRanges: sshSourceRanges,
  targetTags: ["valsea-server"],
  allows: [{ protocol: "tcp", ports: ["22"] }],
});

const startupScript = `#!/usr/bin/env bash
set -euxo pipefail

id -u ${sshUsername} >/dev/null 2>&1 || useradd --create-home --shell /bin/bash ${sshUsername}

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker
usermod -aG docker ${sshUsername}
install -d -o ${sshUsername} -g ${sshUsername} /opt/valsea
install -d -o 1000 -g 1000 /var/lib/valsea

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon /swapfile || true
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-valsea-swap.conf
sysctl --system
`;

const server = new gcp.compute.Instance(
  "server",
  {
    project,
    name: "valsea",
    zone,
    machineType: "e2-micro",
    allowStoppingForUpdate: true,
    bootDisk: {
      autoDelete: true,
      initializeParams: {
        image: "projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64",
        size: 30,
        type: "pd-standard",
      },
    },
    networkInterfaces: [
      {
        subnetwork: subnet.id,
        stackType: "IPV6_ONLY",
        ipv6AccessConfigs: [{ networkTier: "PREMIUM" }],
      },
    ],
    metadata: {
      "ssh-keys": pulumi.interpolate`${sshUsername}:${sshPublicKey}`,
    },
    metadataStartupScript: startupScript,
    shieldedInstanceConfig: {
      enableIntegrityMonitoring: true,
      enableSecureBoot: true,
      enableVtpm: true,
    },
    tags: ["valsea-server"],
  },
  { dependsOn: projectServices },
);

export const instanceName = server.name;
export const instanceZone = server.zone;
export const serverIpv6 = server.networkInterfaces.apply(
  ([networkInterface]) => networkInterface?.ipv6AccessConfigs?.[0]?.externalIpv6,
);
