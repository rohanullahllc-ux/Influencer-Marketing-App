# Installation and Handoff

This Skill is designed to be installed into the Claude environment as a directory-based Agent Skill.

## Directory
skills/digitalventures-influencer-ops/

## Required file
SKILL.md

## Supporting files
references/
workflows/
TEST_PLAN.md

## Handoff
Claude Code should validate frontmatter syntax, Skill naming constraints, relative references, instruction consistency, secret safety, workflow state requirements, and test coverage.
Claude Code may refine implementation details but must not silently change the business workflow, approval gates, safety rules, or entity definitions.

## Completion
Do not treat the Skill as production complete until the test plan has been executed and behavior has been reviewed.