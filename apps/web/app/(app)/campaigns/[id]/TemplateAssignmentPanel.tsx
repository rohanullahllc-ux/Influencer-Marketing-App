"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutreachTemplate, CampaignTemplate } from "@rdv/domain";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { TextInput } from "../../../../components/ui/Form";

export function TemplateAssignmentPanel({
  campaignId,
  allTemplates,
  assignments,
}: {
  campaignId: string;
  allTemplates: OutreachTemplate[];
  assignments: CampaignTemplate[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(allTemplates[0]?.id ?? "");
  const [segment, setSegment] = useState("default");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId || !segment) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/campaigns/${campaignId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, assignmentSegment: segment }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to assign template.");
      return;
    }
    router.refresh();
  }

  const templateById = new Map(allTemplates.map((t) => [t.id, t]));

  return (
    <div>
      {assignments.length === 0 ? (
        <div className="mb-4">
          <EmptyState title="No templates assigned yet" />
        </div>
      ) : (
        <div className="mb-4">
          <Table>
            <Thead>
              <Th>Segment</Th>
              <Th>Template</Th>
            </Thead>
            <tbody>
              {assignments.map((a) => (
                <Tr key={a.id}>
                  <Td>{a.assignmentSegment}</Td>
                  <Td>{templateById.get(a.templateId)?.name ?? a.templateId}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {allTemplates.length === 0 ? (
        <p className="text-supporting text-ink-subtle">
          No templates exist yet. <a href="/templates/new" className="text-primary-600 no-underline hover:underline">Create one</a> first.
        </p>
      ) : (
        <form onSubmit={handleAssign} className="flex flex-wrap items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink focus-visible:focus-ring"
          >
            {allTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <TextInput
            type="text"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            placeholder="segment (e.g. default, top-tier)"
            className="w-56"
          />
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Assigning…" : "Assign"}
          </Button>
        </form>
      )}
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
