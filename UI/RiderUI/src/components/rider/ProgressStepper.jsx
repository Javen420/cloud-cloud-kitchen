export default function ProgressStepper({ currentStep = 0 }) {
  const steps = ["Accepted", "At Pickup", "On Delivery", "Completed"];

  return (
    <div className="progress-stepper">
      {steps.map((step, index) => {
        const active = index <= currentStep;

        return (
          <div key={step} className={`step-item ${active ? "active" : ""}`}>
            <div className="step-dot" />
            <span>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
