import React from "react";

export default function DonutChart({ data, total }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const nonZero = data.filter((item) => Number(item.total) > 0);

  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Facility distribution chart">
        <circle className="donut-track" cx="60" cy="60" r={radius} />
        {nonZero.map((item) => {
          const fraction = total ? Number(item.total) / total : 0;
          const dash = fraction * circumference;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={item.type}
              className="donut-segment"
              cx="60"
              cy="60"
              r={radius}
              stroke={item.color || "#38bdf8"}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-currentOffset}
            />
          );
        })}
        <text x="60" y="56" textAnchor="middle" className="donut-number">{total}</text>
        <text x="60" y="72" textAnchor="middle" className="donut-label">facilities</text>
      </svg>
    </div>
  );
}
