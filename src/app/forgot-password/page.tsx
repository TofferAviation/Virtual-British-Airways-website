import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PasswordResetRequestForm } from "./PasswordResetRequestForm";

export const metadata = { title: "Reset pilot password" };

export default function ForgotPasswordPage() {
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
          <h1>Reset your pilot password</h1>
          <h2>Enter your BAV account email and we’ll send a secure, single-use reset link.</h2>
          <PasswordResetRequestForm />
          <p className="login-security-copy">For security, reset links expire after one hour. We never reveal whether an email address has an active account.</p>
        </div>
        <div className="login-mosaic" aria-hidden="true"><div className="login-tile tile-crew" /><div className="login-tile tile-aircraft" /><div className="login-tile tile-cabin" /></div>
      </section>
    </main>
  );
}
