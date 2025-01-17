import { JsonFetchResultPromiseLike } from "@ddadaal/next-typed-api-routes-runtime/lib/client";
import { api } from "src/apis/api";
import { JobInfo } from "src/clusterops/api/job";
import type { RunningJob } from "src/generated/common/job";

export type MockApi<TApi extends Record<
  string,
 (...args : any[]) => JsonFetchResultPromiseLike<any>>
 > = { [key in keyof TApi]: null | (
    (...args: Parameters<TApi[key]>) =>
    Promise<
      ReturnType<TApi[key]> extends PromiseLike<infer TSuc>
      ? TSuc
      : never
    >)
  };

export const runningJob: RunningJob = {
  jobId: "123",
  account: "123",
  cores: "123",
  name: "123",
  nodes: "123",
  nodesOrReason: "!23",
  nodesToBeUsed: "123",
  partition: "123",
  qos: "123",
  runningTime: "123",
  state: "PENDING",
  submissionTime: "2021-12-22T16:16:02",
  user: "!23",
  timeLimit: "NOT_SET",
  workingDir: "/home/ddadaal/Code",
};

export const job: JobInfo = {
  jobId: "123",
  account: "123",
  name: "123",
  partition: "123",
  qos: "123",
  state: "PENDING",
  timeLimit: "NOT_SET",
  workingDir: "/home/ddadaal/Code",
  elapsed: "00:00:00",
  reason: "None",
  submitTime: "2022-07-07T09:21:42",
};

export const mockApi: MockApi<typeof api> = {

  getAllJobs: async () => ({ results: [job]}),

  listFile: null,

  copyFileItem: null,
  createFile: null,
  deleteDir: null,
  deleteFile: null,
  getHomeDirectory: null,
  mkdir: null,
  moveFileItem: null,

  downloadFile: null,
  uploadFile: null,

  createAppSession: async () => ({ jobId: 123, sessionId: "is" }),

  cancelJob: async () => null,

  getAppSessions: async () => ({ sessions: [
    { jobId: 100, sessionId: "123", appId: "vscode", state: "PENDING",
      submitTime: new Date().toISOString(), ready: false, dataPath: "/test" },
    { jobId: 101, sessionId: "124", appId: "vscode", state: "RUNNING",
      submitTime: new Date().toISOString(), ready: true, dataPath: "/test" },
    { jobId: 102, sessionId: "125", appId: "vscode", state: "RUNNING",
      submitTime: new Date().toISOString(), ready: true, dataPath: "/test" },
  ]}),

  connectToApp: async ({ body: { sessionId } }) => sessionId === "124"
    ? {
      host: "127.0.0.1", port: 3000, password: "123", type: "web",
      connect: {
        method: "POST",
        path: "/test",
        query: { test: "!23" },
        formData: { test: "123" },
      },
    }
    : {
      host: "127.0.0.1", port: 3000, password: "123", type: "vnc",
    }
  ,

  getSavedJob: async () => ({
    jobInfo: {
      account: "123",
      command: "123",
      coreCount: 2,
      jobName: "123",
      maxTime: 123,
      nodeCount: 4,
      partition: "low",
      qos: "low",
      workingDirectory: "/nfs/jobs/123",
    },
  }),

  getSavedJobs: async () => ({ results: [{
    id: "123-sample-apple",
    comment: "1234",
    submitTime: new Date().toString(),
    jobName: "sample-apple",
  }]}),

  getIcon: async () => undefined,

  getLogo: async () => undefined,

  getAccounts: async () => ({ accounts: ["hpc01", "hpc02"]}),

  launchDesktop: async () => ({ node: "login01", password: "123", port: 1234 }),

  listDesktops: async () => ({
    node: "login01",
    displayId: [1, 2, 3],
  }),

  createDesktop: async () => (
    {
      node: "login01",
      password: "123",
      port: 1234,
    }),

  killDesktop: async () => null,

  logout: async () => null,

  authCallback: async () => undefined as never,

  changePassword: async () => null,

  validateToken: null,

  getRunningJobs: async () => ({ results: [runningJob]}),

  submitJob: async () => ({ jobId: 10 }),
};

