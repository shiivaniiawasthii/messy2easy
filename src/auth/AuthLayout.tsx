import { Icon } from "../components/Icon";

/** Page frame for login-related screens: Messy2Easy brand, a centred card, tagline. */
export function AuthLayout({ children, footer = "Business software · Automation · Digital products" }: { children: React.ReactNode; footer?: string }) {
  return <div className="login-page">
    <div className="login-brand"><span className="brand-mark">M</span><span><strong>Messy2Easy</strong><small>SOLUTIONS</small></span></div>
    <main className="login-main">
      <section className="login-card">{children}</section>
      <p className="login-help">{footer}</p>
    </main>
    <div className="login-gym"><Icon name="sparkles" size={16}/><span><strong>Messy2Easy Solutions</strong><small>From messy work to easy solutions.</small></span></div>
  </div>;
}
