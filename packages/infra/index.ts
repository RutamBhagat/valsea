import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.get("region") ?? "us-west1";

const audioBucket = new gcp.storage.Bucket("audio", {
  location: region,
  uniformBucketLevelAccess: true,
});

const transcriptionQueue = new gcp.cloudtasks.Queue("transcription", {
  name: "valsea-transcriptions",
  location: region,
});

const backendRepository = new gcp.artifactregistry.Repository("backend", {
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
  accountId: "valsea-task-invoker",
  displayName: "VALSEA Cloud Tasks invoker",
});

const workerService = new gcp.cloudrunv2.Service("worker", {
  name: "valsea-worker",
  location: region,
  deletionProtection: false,
  ingress: "INGRESS_TRAFFIC_ALL",
  template: {
    containers: [
      {
        image: backendImage,
        ports: { containerPort: 3000 },
      },
    ],
  },
});

const apiService = new gcp.cloudrunv2.Service("api", {
  name: "valsea-api",
  location: region,
  deletionProtection: false,
  ingress: "INGRESS_TRAFFIC_ALL",
  invokerIamDisabled: true,
  template: {
    containers: [
      {
        image: backendImage,
        ports: { containerPort: 3000 },
        envs: [
          { name: "GCP_PROJECT_ID", value: project },
          { name: "GCP_REGION", value: region },
          { name: "GCS_AUDIO_BUCKET", value: audioBucket.name },
          { name: "CLOUD_TASKS_QUEUE", value: transcriptionQueue.name },
          { name: "WORKER_URL", value: workerService.uri },
        ],
      },
    ],
  },
});

new gcp.cloudrunv2.ServiceIamMember("worker-task-invoker", {
  project,
  location: region,
  name: workerService.name,
  role: "roles/run.invoker",
  member: pulumi.interpolate`serviceAccount:${taskInvoker.email}`,
});

export const audioBucketName = audioBucket.name;
export const transcriptionQueueName = transcriptionQueue.name;
export const backendRepositoryName = backendRepository.name;
export const backendImageName = backendImage;
export const apiUrl = apiService.uri;
export const workerUrl = workerService.uri;
export const taskInvokerEmail = taskInvoker.email;
