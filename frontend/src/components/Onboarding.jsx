import React, { useState } from "react";
import { Icon } from "./Icons.jsx";

const STEPS = [
  {
    icon: "layers",
    title: "Control the city map",
    text: "Switch Mapbox basemaps, filter all infrastructure categories, reveal zones, and enable a density heatmap or 3D buildings."
  },
  {
    icon: "target",
    title: "Run spatial analysis",
    text: "Click any point, then calculate the nearest facility, a radius search, or a true PostGIS buffer against your 300-record database."
  },
  {
    icon: "route",
    title: "Generate live routes",
    text: "Route from the selected origin to any facility using driving, walking, or cycling directions and animated O/D markers."
  },
  {
    icon: "database",
    title: "Pitch-ready data intelligence",
    text: "Explore database quality, facility distribution, city coverage, selection details, and a real analysis audit trail."
  }
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const item = STEPS[step];

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card">
        <div className="onboarding-visual">
          <div className="onboarding-grid" />
          <span className="onboarding-pulse pulse-a" />
          <span className="onboarding-pulse pulse-b" />
          <span className="onboarding-pulse pulse-c" />
          <div className="onboarding-icon"><Icon name={item.icon} size={30} /></div>
        </div>
        <div className="onboarding-content">
          <span className="eyebrow">WELCOME TO CIMS 2.0</span>
          <h2>{item.title}</h2>
          <p>{item.text}</p>
          <div className="onboarding-dots">
            {STEPS.map((_, index) => <span key={index} className={index === step ? "active" : ""} />)}
          </div>
          <div className="onboarding-actions">
            <button className="text-button" onClick={onComplete}>Skip tour</button>
            <button className="primary-button compact" onClick={() => step === STEPS.length - 1 ? onComplete() : setStep(step + 1)}>
              {step === STEPS.length - 1 ? "Open dashboard" : "Next"}
              <Icon name={step === STEPS.length - 1 ? "check" : "chevron"} size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
