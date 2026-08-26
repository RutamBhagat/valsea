import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const gcpConfig = new pulumi.Config("gcp");
const appConfig = new pulumi.Config("app");

function requireEnvironmentValue(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set when it is not provided through Pulumi config`);
  return value;
}

function runtimeSecret(configKey: string, environmentKey: string) {
  return appConfig.getSecret(configKey) ?? pulumi.secret(requireEnvironmentValue(environmentKey));
}

function runtimeValue(configKey: string, environmentKey: string) {
  return appConfig.get(configKey) ?? requireEnvironmentValue(environmentKey);
}

const project = gcpConfig.get("project") ?? requireEnvironmentValue("GCP_PROJECT_ID");
const region = gcpConfig.get("region") ?? "us-west1";
const serviceName = "valsea-api";
const projectDetails = gcp.organizations.getProjectOutput({ projectId: project });
const serviceUrl = pulumi.interpolate`https://${serviceName}-${projectDetails.number}.${region}.run.app`;

const sharedRuntimeEnv = [
  { name: "DATABASE_URL", value: runtimeSecret("databaseUrl", "DATABASE_URL") },
  { name: "DATABASE_URL_DIRECT", value: runtimeSecret("databaseUrlDirect", "DATABASE_URL_DIRECT") },
  { name: "BETTER_AUTH_SECRET", value: runtimeSecret("betterAuthSecret", "BETTER_AUTH_SECRET") },
  { name: "BETTER_AUTH_URL", value: runtimeValue("betterAuthUrl", "BETTER_AUTH_URL") },
  { name: "CORS_ORIGIN", value: runtimeValue("corsOrigin", "CORS_ORIGIN") },
  { name: "GOOGLE_CLIENT_ID", value: runtimeSecret("googleClientId", "GOOGLE_CLIENT_ID") },
  {
    name: "GOOGLE_CLIENT_SECRET",
    value: runtimeSecret("googleClientSecret", "GOOGLE_CLIENT_SECRET"),
  },
  { name: "VALSEA_API_KEY", value: runtimeSecret("valseaApiKey", "VALSEA_API_KEY") },
];

const audioBucket = new gcp.storage.Bucket("audio", {
  project,
  location: region,
  uniformBucketLevelAccess: true,
});

const transcriptionQueue = new gcp.cloudtasks.Queue("transcription", {
  project,
  name: "valsea-transcriptions",
  location: region,
});

const backendRepository = new gcp.artifactregistry.Repository("backend", {
  project,
  repositoryId: "valsea",
  location: region,
  format: "DOCKER",
  description: "VALSEA backend images",
  cleanupPolicyDryRun: false,
  cleanupPolicies: [
    {
      id: "delete-old-images",
      action: "DELETE",
      condition: {
        tagState: "ANY",
        olderThan: "7d",
      },
    },
    {
      id: "keep-recent-images",
      action: "KEEP",
      mostRecentVersions: {
        keepCount: 3,
      },
    },
  ],
});

const backendImage = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${backendRepository.repositoryId}/server:latest`;

const taskInvoker = new gcp.serviceaccount.Account("task-invoker", {
  project,
  accountId: "valsea-task-invoker",
  displayName: "VALSEA Cloud Tasks invoker",
});

const runtimeServiceAccount = new gcp.serviceaccount.Account("api-service", {
  project,
  accountId: "valsea-api",
  displayName: "VALSEA runtime service",
});

new gcp.storage.BucketIAMMember("api-audio-writer", {
  bucket: audioBucket.name,
  role: "roles/storage.objectCreator",
  member: pulumi.interpolate`serviceAccount:${runtimeServiceAccount.email}`,
});

new gcp.storage.BucketIAMMember("runtime-audio-reader", {
  bucket: audioBucket.name,
  role: "roles/storage.objectViewer",
  member: pulumi.interpolate`serviceAccount:${runtimeServiceAccount.email}`,
});

new gcp.cloudtasks.QueueIamMember("api-task-enqueuer", {
  project,
  location: region,
  name: transcriptionQueue.name,
  role: "roles/cloudtasks.enqueuer",
  member: pulumi.interpolate`serviceAccount:${runtimeServiceAccount.email}`,
});

new gcp.serviceaccount.IAMMember("api-task-invoker-user", {
  serviceAccountId: taskInvoker.name,
  role: "roles/iam.serviceAccountUser",
  member: pulumi.interpolate`serviceAccount:${runtimeServiceAccount.email}`,
});

const apiService = new gcp.cloudrunv2.Service("api", {
  project,
  name: serviceName,
  location: region,
  deletionProtection: false,
  ingress: "INGRESS_TRAFFIC_ALL",
  invokerIamDisabled: true,
  template: {
    serviceAccount: runtimeServiceAccount.email,
    containers: [
      {
        image: backendImage,
        ports: { containerPort: 3000 },
        envs: [
          ...sharedRuntimeEnv,
          { name: "GCP_PROJECT_ID", value: project },
          { name: "GCP_REGION", value: region },
          { name: "GCS_AUDIO_BUCKET", value: audioBucket.name },
          { name: "CLOUD_TASKS_QUEUE", value: transcriptionQueue.name },
          { name: "TASK_INVOKER_SERVICE_ACCOUNT_EMAIL", value: taskInvoker.email },
          { name: "TASK_TARGET_URL", value: serviceUrl },
        ],
      },
    ],
  },
});

new gcp.cloudrunv2.ServiceIamMember("service-task-invoker", {
  project,
  location: region,
  name: apiService.name,
  role: "roles/run.invoker",
  member: pulumi.interpolate`serviceAccount:${taskInvoker.email}`,
});

export const audioBucketName = audioBucket.name;
export const transcriptionQueueName = transcriptionQueue.name;
export const backendRepositoryName = backendRepository.name;
export const backendImageName = backendImage;
export const apiUrl = apiService.uri;
export const taskInvokerEmail = taskInvoker.email;
