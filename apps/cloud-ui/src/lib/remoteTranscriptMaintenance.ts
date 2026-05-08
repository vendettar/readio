import { runRemoteTranscriptCacheMaintenance } from './remoteTranscript'

export async function runRemoteTranscriptMaintenanceTask(): Promise<void> {
  await runRemoteTranscriptCacheMaintenance()
}
