"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@rdv/domain";

function parseList(s: string): string[] | undefined {
  const items = s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return items.length > 0 ? items : undefined;
}

/** Wave 2 Phase 4 (plan §9): creates a campaign with every §14.5 field settable, against a chosen product. */
export function NewCampaignForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [targetGeography, setTargetGeography] = useState("");
  const [targetLanguages, setTargetLanguages] = useState("");
  const [creatorTypes, setCreatorTypes] = useState("");
  const [nicheRequirements, setNicheRequirements] = useState("");
  const [minSubscribers, setMinSubscribers] = useState("");
  const [minAvgViews, setMinAvgViews] = useState("");
  const [minEngagementRate, setMinEngagementRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [outreachStrategy, setOutreachStrategy] = useState("");
  const [firstSendCap, setFirstSendCap] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const qualificationThresholds: Record<string, number> = {};
    if (minSubscribers) qualificationThresholds.minSubscribers = Number(minSubscribers);
    if (minAvgViews) qualificationThresholds.minAvgViews = Number(minAvgViews);
    if (minEngagementRate) qualificationThresholds.minEngagementRate = Number(minEngagementRate);

    const sendingLimits: Record<string, number> = {};
    if (dailyCap) sendingLimits.dailyCap = Number(dailyCap);

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        name,
        objective: objective || undefined,
        targetGeography: parseList(targetGeography),
        targetLanguages: parseList(targetLanguages),
        creatorTypes: parseList(creatorTypes),
        nicheRequirements: parseList(nicheRequirements),
        qualificationThresholds: Object.keys(qualificationThresholds).length > 0 ? qualificationThresholds : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        outreachStrategy: outreachStrategy || undefined,
        sendingLimits: Object.keys(sendingLimits).length > 0 ? sendingLimits : undefined,
        firstSendCap: firstSendCap ? Number(firstSendCap) : undefined,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create campaign.");
      return;
    }

    const campaign = await res.json();
    router.push(`/campaigns/${campaign.id}`);
  }

  if (products.length === 0) {
    return (
      <p style={{ color: "#666" }}>
        No products exist yet. <a href="/products/new">Create a product</a> before starting a campaign.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="productId" style={{ display: "block", marginBottom: 4 }}>
          Product
        </label>
        <select id="productId" value={productId} onChange={(e) => setProductId(e.target.value)} style={{ width: "100%", padding: 8 }}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="name" style={{ display: "block", marginBottom: 4 }}>
          Campaign name
        </label>
        <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="objective" style={{ display: "block", marginBottom: 4 }}>
          Objective
        </label>
        <input id="objective" type="text" value={objective} onChange={(e) => setObjective(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="targetGeography" style={{ display: "block", marginBottom: 4 }}>
          Target geography (comma-separated)
        </label>
        <input
          id="targetGeography"
          type="text"
          value={targetGeography}
          onChange={(e) => setTargetGeography(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="targetLanguages" style={{ display: "block", marginBottom: 4 }}>
          Target languages (comma-separated)
        </label>
        <input
          id="targetLanguages"
          type="text"
          value={targetLanguages}
          onChange={(e) => setTargetLanguages(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="creatorTypes" style={{ display: "block", marginBottom: 4 }}>
          Creator types (comma-separated)
        </label>
        <input
          id="creatorTypes"
          type="text"
          value={creatorTypes}
          onChange={(e) => setCreatorTypes(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="nicheRequirements" style={{ display: "block", marginBottom: 4 }}>
          Niche requirements (comma-separated)
        </label>
        <input
          id="nicheRequirements"
          type="text"
          value={nicheRequirements}
          onChange={(e) => setNicheRequirements(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <fieldset style={{ marginBottom: 10, padding: 10, border: "1px solid #ddd" }}>
        <legend style={{ fontSize: 13 }}>Qualification thresholds</legend>
        <div style={{ display: "flex", gap: 8 }}>
          <div>
            <label htmlFor="minSubscribers" style={{ display: "block", fontSize: 12 }}>
              Min subscribers
            </label>
            <input id="minSubscribers" type="number" value={minSubscribers} onChange={(e) => setMinSubscribers(e.target.value)} style={{ width: 120, padding: 6 }} />
          </div>
          <div>
            <label htmlFor="minAvgViews" style={{ display: "block", fontSize: 12 }}>
              Min avg views
            </label>
            <input id="minAvgViews" type="number" value={minAvgViews} onChange={(e) => setMinAvgViews(e.target.value)} style={{ width: 120, padding: 6 }} />
          </div>
          <div>
            <label htmlFor="minEngagementRate" style={{ display: "block", fontSize: 12 }}>
              Min engagement %
            </label>
            <input
              id="minEngagementRate"
              type="number"
              value={minEngagementRate}
              onChange={(e) => setMinEngagementRate(e.target.value)}
              style={{ width: 120, padding: 6 }}
            />
          </div>
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div>
          <label htmlFor="startDate" style={{ display: "block", marginBottom: 4 }}>
            Start date
          </label>
          <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: 8 }} />
        </div>
        <div>
          <label htmlFor="endDate" style={{ display: "block", marginBottom: 4 }}>
            End date
          </label>
          <input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: 8 }} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label htmlFor="outreachStrategy" style={{ display: "block", marginBottom: 4 }}>
          Outreach strategy
        </label>
        <textarea
          id="outreachStrategy"
          value={outreachStrategy}
          onChange={(e) => setOutreachStrategy(e.target.value)}
          rows={3}
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div>
          <label htmlFor="firstSendCap" style={{ display: "block", marginBottom: 4 }}>
            First-send cap
          </label>
          <input
            id="firstSendCap"
            type="number"
            min={0}
            value={firstSendCap}
            onChange={(e) => setFirstSendCap(e.target.value)}
            style={{ padding: 8, width: 140 }}
          />
        </div>
        <div>
          <label htmlFor="dailyCap" style={{ display: "block", marginBottom: 4 }}>
            Daily sending limit
          </label>
          <input id="dailyCap" type="number" min={0} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} style={{ padding: 8, width: 140 }} />
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
