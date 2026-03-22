export default function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <strong className="detail-value">{value}</strong>
    </div>
  );
}
