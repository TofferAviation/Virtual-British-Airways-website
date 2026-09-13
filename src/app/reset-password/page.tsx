import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PasswordResetConfirmForm } from "./PasswordResetConfirmForm";

export const metadata = { title: "Choose a new password" };

type ResetPasswordPageProps = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = (await searchParams).token ?? "";
  return (
    <main className="login-page">
      <header className="login-header">
        <nav className="login-header-nav" aria-label="Account navigation"><Link href="/">Home</Link><Link href="/help">Help</Link></nav>
        <Link className="login-brand" href="/"><BrandLogo variant="white" priority /></Link>
        <div className="login-header-actions"><Link href="/login" className="login-header-button">Sign in</Link></div>
      </header>
      <section className="login-main pilot-auth-main">
        <div className="login-copy-block pilot-auth-copy">
          <div className="section-kicker">BAV account recovery</div>
          <h1>Choose a new password</h1>
          <h2>Use at least 10 characters. This reset link can be used once only.</h2>
          <PasswordResetConfirmForm token={token} />
        </div>
        <div className="login-mosaic" aria-hidden="true"><div className="login-tile tile-crew" /><div className="login-tile tile-aircraft" /><div className="login-tile tile-cabin" /></div>
      </section>
    </main>
  );
}
