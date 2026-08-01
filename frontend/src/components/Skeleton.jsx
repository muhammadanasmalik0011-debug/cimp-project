import React from "react";

export default function Skeleton() {
  return (
    <div className="skeleton-shell" aria-label="Loading CIMS dashboard">
      <div className="skeleton-header shimmer" />
      <div className="skeleton-body">
        <div className="skeleton-rail">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="skeleton-line shimmer" key={index} />
          ))}
        </div>
        <div className="skeleton-map">
          <div className="skeleton-orbit" />
          <div className="skeleton-center-card shimmer" />
        </div>
        <div className="skeleton-right">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton-card shimmer" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
