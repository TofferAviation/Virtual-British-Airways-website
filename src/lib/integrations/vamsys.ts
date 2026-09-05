export type VamsysPilotIdentity = {
  id: string;
  callsign?: string;
  displayName?: string;
  email?: string;
};

/**
 * vAMSYS integration boundary.
 *
 * Do not collect or store a pilot's vAMSYS password in this application.
 * When approved API/SSO documentation is available, implement the provider
 * flow here and map the returned identity into the website's local pilot model.
 */
export async function getVamsysPilotIdentity(): Promise<VamsysPilotIdentity | null> {
  return null;
}
