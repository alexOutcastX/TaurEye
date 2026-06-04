import "./Placeholder.css";

type Props = { title: string; subtitle: string; phase: string };

export default function Placeholder({ title, subtitle, phase }: Props) {
  return (
    <section className="ph">
      <div className="ph-head">
        <h1>{title}</h1>
        <span className="ph-badge">{phase}</span>
      </div>
      <p className="ph-sub">{subtitle}</p>

      <div className="ph-canvas">
        <div className="ph-grid" />
        <span className="ph-note">UI shell only · data wiring lands in a later phase</span>
      </div>
    </section>
  );
}
