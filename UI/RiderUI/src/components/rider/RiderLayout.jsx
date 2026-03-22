export default function RiderLayout({ title, subtitle, children }) {
  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Rider UI</p>
          <h1>{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
      </header>

      {children}
    </div>
  );
}
