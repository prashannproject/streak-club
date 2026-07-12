import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");

  return (
    <main className="authPage">
      <div className="orb orbOne" />
      <div className="orb orbTwo" />
      <section className="authCard glass">
        <div className="brand authBrand">
          <span className="brandMark">S</span>
          <span>streak club</span>
        </div>
        <span className="eyebrow">INVITE-ONLY PILOT</span>
        <h1>Do the tiny thing.<br />Flex the streak.</h1>
        <p className="lede">
          A low-pressure habit club for friends who hype each other up.
        </p>
        <LoginForm />
        <p className="softNote">No public sign-up. Your club admin creates your account.</p>
      </section>
      <aside className="authSticker" aria-hidden="true">
        <span>+1</span>
        <strong>today counts</strong>
      </aside>
    </main>
  );
}
