import type { ReactNode } from "react";
import logo from "../../assets/OcTransparent.png";
import { classNames } from "../lib/format";

export function Skeleton({
  width,
  height,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={classNames("skeleton", className)}
      style={{ width, height, ...style }}
      aria-hidden
    />
  );
}

export function ProjectSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="project-grid" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div className="project-card" key={index}>
          <div className="project-head">
            <Skeleton width={48} height={48} />
            <div className="grow skeleton-text">
              <Skeleton className="skeleton-line" width="55%" />
              <Skeleton className="skeleton-line" width="35%" />
            </div>
          </div>
          <Skeleton className="skeleton-line" width="100%" />
          <Skeleton className="skeleton-line" width="80%" />
          <Skeleton height={32} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <div className="empty-title">{title}</div>
      {text ? <p className="empty-text">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-heading">
        <div className="page-heading-row">
          <span className="section-orb page-orb">
            <img src={logo} alt="" />
          </span>
          <div className="page-heading-text">
            {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
            <h1 className="page-title">{title}</h1>
          </div>
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
