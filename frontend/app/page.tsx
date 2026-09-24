import SiteShell from "@/components/SiteShell";
import { ButtonLink } from "@/components/Button";
import styles from "./page.module.css";

export default function Home() {
  return <SiteShell page="home">
    <section className={styles.hero}>
      <div className={styles.intro}>
        <p className="eyebrow"><span className={styles.dash} /> Your next chapter, organized</p>
        <h1>Less scattered.<br />More <span>shipped.</span></h1>
        <p className={styles.description}>A calmer home for your development work. Bring your ideas, find your focus, and make room for what’s next.</p>
        <div className={styles.actions}><ButtonLink href="/register">Create your account <span aria-hidden="true">↗</span></ButtonLink><ButtonLink href="/login" variant="secondary">Welcome back</ButtonLink></div>
        <p className={styles.note}>Your ideas deserve a place to land.</p>
      </div>
      <div className={styles.visual} aria-label="An illustration of a focused development workspace">
        <div className={styles.orbit} aria-hidden="true" />
        <div className={styles.workspace}>
          <div className={styles.workspaceTop}><span className="eyebrow">The bigger picture</span><span aria-hidden="true">↗</span></div>
          <div className={styles.workspaceHeading}><span className={styles.projectIcon} aria-hidden="true">⌘</span><div><h2>Make space for progress.</h2><p>One thoughtful step at a time.</p></div></div>
          <div className={styles.path} aria-hidden="true"><span>01</span><i /><span>02</span><i /><span>03</span></div>
          <div className={styles.pathLabels}><span>Capture an idea</span><span>Find your focus</span><span>Build something</span></div>
          <div className={styles.code} aria-hidden="true"><span>~/your-next-idea</span><p><b>→</b> a little progress, every day<span className={styles.cursor} /></p></div>
          <div className={styles.visualFooter}><span className={styles.dot} /> Room for your next good idea</div>
        </div>
        <span className={styles.caption}>A workspace taking shape, with you.</span>
      </div>
    </section>
    <section className={styles.bottom} aria-labelledby="start-heading">
      <div><p className="eyebrow">Start with your space</p><h2 id="start-heading">One account. A fresh start.</h2></div>
      <p>Create your DevPilot account today.<br />Project and issue tools are on the way.</p>
      <span className={styles.bottomMark} aria-hidden="true">↗</span>
    </section>
  </SiteShell>;
}
