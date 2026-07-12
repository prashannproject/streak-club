import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { CreateGroupForm } from "@/components/forms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Create a group" };

export default async function NewGroupPage() {
  const user = await requireUser();
  return (
    <AppShell user={user}>
      <section className="narrowPage">
        <span className="eyebrow">NEW CLUB ENERGY</span>
        <h1>Build your tiny<br />accountability universe.</h1>
        <p className="lede">
          Free groups fit four people and three active habits. Keep it close, not crowded.
        </p>
        <div className="panel glass">
          <CreateGroupForm />
        </div>
      </section>
    </AppShell>
  );
}
