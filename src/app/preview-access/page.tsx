import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { previewPasswordConfigured, previewProtectionEnabled } from "@/lib/preview-access";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private development preview",
  description: "Private development access for invited British Airways Virtual website testers.",
};

type PreviewAccessPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function PreviewAccessPage({ searchParams }: PreviewAccessPageProps) {
  if (!previewProtectionEnabled()) redirect("/");

  const params = await searchParams;
  const configured = previewPasswordConfigured();
  const nextPath = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/";
  const invalidPassword = params.error === "invalid";
  const configurationError = params.error === "config" || !configured;

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="preview-access-title">
        <div className={styles.brandPanel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" />

          <div className={styles.brandCopy}>
            <span className={styles.eyebrow}>Private development preview</span>
            <h1 id="preview-access-title">Website under development</h1>
            <div className={styles.rule} aria-hidden="true" />
            <p>
              This preview environment is currently limited to invited testers while British Airways Virtual is being built and reviewed.
            </p>
          </div>

          <p className={styles.disclaimer}>
            Flight simulation use only · Independent virtual airline · Not affiliated with British Airways Plc
          </p>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formWrap}>
            <div className={styles.lockMark} aria-hidden="true">⌁</div>
            <h2>Preview access</h2>
            <p>Enter the temporary preview password provided by the development team.</p>

            {invalidPassword ? (
              <div className={styles.error} role="alert">That preview password was not recognised. Please try again.</div>
            ) : null}

            {configurationError ? (
              <div className={styles.configError} role="alert">
                Preview protection is enabled, but no preview password is configured. Set <strong>BAV_PREVIEW_PASSWORD</strong> in <strong>.env.local</strong> and restart the server.
              </div>
            ) : null}

            <form className={styles.form} method="post" action="/api/preview-access">
              <input type="hidden" name="next" value={nextPath} />
              <label htmlFor="preview-password">Preview password</label>
              <input
                id="preview-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                disabled={!configured}
              />
              <button type="submit" disabled={!configured}>Enter preview</button>
            </form>

            <div className={styles.note}>
              Access is temporary and intended only for website development, review and testing. Pilot and Staff Centre authentication remain separate.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
