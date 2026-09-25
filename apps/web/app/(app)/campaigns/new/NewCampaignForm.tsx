"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@rdv/domain";
import { FormSection, FormField, TextInput, TextArea } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

function parseList(s: string): string[] | undefined {
  const items = s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return items.length > 0 ? items : undefined;
}

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
      <p className="text-supporting text-ink-subtle">
        No products exist yet. <a href="/products/new" className="text-primary-600 no-underline hover:underline">Create a product</a> before
        starting a campaign.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormSection title="Basics">
        <FormField label="Product" htmlFor="productId" required>
          <select
            id="productId"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink focus-visible:focus-ring"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Campaign name" htmlFor="name" required>
          <TextInput id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Objective" htmlFor="objective">
          <TextInput id="objective" type="text" value={objective} onChange={(e) => setObjective(e.target.value)} />
        </FormField>
      </FormSection>

      <FormSection title="Targeting">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Target geography" htmlFor="targetGeography" hint="comma-separated">
            <TextInput id="targetGeography" type="text" value={targetGeography} onChange={(e) => setTargetGeography(e.target.value)} />
          </FormField>
          <FormField label="Target languages" htmlFor="targetLanguages" hint="comma-separated">
            <TextInput id="targetLanguages" type="text" value={targetLanguages} onChange={(e) => setTargetLanguages(e.target.value)} />
          </FormField>
          <FormField label="Creator types" htmlFor="creatorTypes" hint="comma-separated">
            <TextInput id="creatorTypes" type="text" value={creatorTypes} onChange={(e) => setCreatorTypes(e.target.value)} />
          </FormField>
          <FormField label="Niche requirements" htmlFor="nicheRequirements" hint="comma-separated">
            <TextInput id="nicheRequirements" type="text" value={nicheRequirements} onChange={(e) => setNicheRequirements(e.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Qualification thresholds" description="Deterministic pass/fail criteria run against every shortlisted creator.">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
          <FormField label="Min subscribers" htmlFor="minSubscribers">
            <TextInput id="minSubscribers" type="number" value={minSubscribers} onChange={(e) => setMinSubscribers(e.target.value)} />
          </FormField>
          <FormField label="Min avg views" htmlFor="minAvgViews">
            <TextInput id="minAvgViews" type="number" value={minAvgViews} onChange={(e) => setMinAvgViews(e.target.value)} />
          </FormField>
          <FormField label="Min engagement %" htmlFor="minEngagementRate">
            <TextInput id="minEngagementRate" type="number" value={minEngagementRate} onChange={(e) => setMinEngagementRate(e.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Schedule & strategy">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Start date" htmlFor="startDate">
            <TextInput id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="End date" htmlFor="endDate">
            <TextInput id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Outreach strategy" htmlFor="outreachStrategy">
          <TextArea id="outreachStrategy" value={outreachStrategy} onChange={(e) => setOutreachStrategy(e.target.value)} rows={3} />
        </FormField>
      </FormSection>

      <FormSection title="Sending limits" description="Conservative by default — a human-controlled safety boundary, not auto-incremented.">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="First-send cap" htmlFor="firstSendCap">
            <TextInput id="firstSendCap" type="number" min={0} value={firstSendCap} onChange={(e) => setFirstSendCap(e.target.value)} />
          </FormField>
          <FormField label="Daily sending limit" htmlFor="dailyCap">
            <TextInput id="dailyCap" type="number" min={0} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} />
          </FormField>
        </div>
      </FormSection>

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Creating…" : "Create campaign"}
      </Button>
    </form>
  );
}
