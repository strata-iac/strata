import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { BaselineConfig, BenchmarkResults, Mode, TrialResult, Variant } from "./types";

interface MetricCheck {
	metric: string;
	p50: number | null;
	threshold: number;
	limit: number;
	pass: boolean;
}

interface ComboSummary {
	n: number;
	mode: Mode;
	variant: Variant;
	checks: MetricCheck[];
	pass: boolean;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? null;
	const left = sorted[middle - 1];
	const right = sorted[middle];
	if (left === undefined || right === undefined) return null;
	return (left + right) / 2;
}

function formatMs(value: number): string {
	return `${value.toFixed(1)}ms`;
}

async function main(): Promise<void> {
	const resultsPath = path.join(import.meta.dir, "results.json");
	const baselinePath = process.env.BENCH_BASELINE ?? path.join(import.meta.dir, "baseline.json");

	const [results, baseline] = await Promise.all([
		Bun.file(resultsPath).json() as Promise<BenchmarkResults>,
		Bun.file(baselinePath).json() as Promise<BaselineConfig>,
	]);

	const tolerancePct = baseline.tolerancePct ?? 20;
	const errors: string[] = [];

	const failedTrials = results.results.filter((row) => row.upExitCode !== 0);
	if (failedTrials.length > 0) {
		for (const row of failedTrials) {
			errors.push(
				`${row.mode}/${row.variant} n=${row.n} trial=${row.trial} exit=${row.upExitCode}`,
			);
		}
	}

	const grouped = new Map<string, TrialResult[]>();
	for (const row of results.results) {
		const key = `${row.n}::${row.mode}/${row.variant}`;
		const existing = grouped.get(key) ?? [];
		existing.push(row);
		grouped.set(key, existing);
	}

	const expectedKeys = new Set<string>();
	for (const nKey of Object.keys(baseline.thresholds)) {
		const n = Number(nKey);
		if (!results.benchSizes.includes(n)) continue;
		for (const comboKey of Object.keys(baseline.thresholds[nKey] ?? {})) {
			expectedKeys.add(`${n}::${comboKey}`);
		}
	}

	for (const key of expectedKeys) {
		if (!grouped.has(key)) {
			errors.push(`Missing results for expected combo: ${key.replace("::", " ")}`);
		}
	}

	const summaries: ComboSummary[] = [];

	for (const rows of grouped.values()) {
		const sample = rows[0];
		if (!sample) continue;

		const nKey = String(sample.n);
		const comboKey = `${sample.mode}/${sample.variant}`;
		const thresholdEntry = baseline.thresholds[nKey]?.[comboKey];
		if (!thresholdEntry) continue;

		const successful = rows.filter((r) => r.upExitCode === 0);
		const metrics: Array<{ metric: string; threshold: number; values: number[] }> = [
			{ metric: "up", threshold: thresholdEntry.maxUpP50Ms, values: successful.map((r) => r.upMs).filter((v): v is number => v !== null) },
		];
		if (thresholdEntry.maxDestroyP50Ms) {
			metrics.push({ metric: "destroy", threshold: thresholdEntry.maxDestroyP50Ms, values: successful.map((r) => r.destroyMs).filter((v): v is number => v !== null) });
		}
		if (thresholdEntry.maxPreviewP50Ms) {
			metrics.push({ metric: "preview", threshold: thresholdEntry.maxPreviewP50Ms, values: successful.map((r) => r.previewMs).filter((v): v is number => v !== null) });
		}

		const checks: MetricCheck[] = [];
		for (const m of metrics) {
			const limit = m.threshold * (1 + tolerancePct / 100);
			const p50 = median(m.values);
			const pass = p50 !== null && p50 <= limit;
			checks.push({ metric: m.metric, p50, threshold: m.threshold, limit, pass });
			if (!pass) {
				if (p50 === null) {
					errors.push(`No successful ${m.metric} values for n=${sample.n}, combo=${comboKey}`);
				} else {
					errors.push(
						`${comboKey} n=${sample.n} ${m.metric} p50=${formatMs(p50)} exceeds limit=${formatMs(limit)} (threshold=${formatMs(m.threshold)}, tolerance=${tolerancePct}%)`,
					);
				}
			}
		}

		summaries.push({
			n: sample.n,
			mode: sample.mode,
			variant: sample.variant,
			checks,
			pass: checks.every((c) => c.pass),
		});
	}

	summaries.sort((a, b) => {
		if (a.n !== b.n) return a.n - b.n;
		if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
		return a.variant.localeCompare(b.variant);
	});

	function padLeft(s: string, w: number): string {
		return s.length >= w ? s : `${" ".repeat(w - s.length)}${s}`;
	}

	console.log("");
	console.log("━".repeat(78));
	console.log("  THRESHOLD CHECK");
	console.log("━".repeat(78));

	for (const s of summaries) {
		for (const c of s.checks) {
			const p50Text = c.p50 === null ? "N/A" : formatMs(c.p50);
			const icon = c.pass ? "✓" : "✗";
			const status = c.pass ? "PASS" : "FAIL";
			console.log(
				`  ${icon} ${s.mode}/${s.variant} N=${String(s.n).padStart(4)}  ${c.metric.padEnd(7)}  p50=${padLeft(p50Text, 10)}  limit=${padLeft(formatMs(c.limit), 10)}  ${status}`,
			);
		}
	}

	console.log("━".repeat(78));
	console.log("");

	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (summaryPath) {
		const md: string[] = [];
		md.push("### 🎯 Threshold Check");
		md.push("");
		md.push("| N | Mode | Variant | Metric | p50 | Limit | Status |");
		md.push("|---:|------|---------|--------|----:|------:|--------|");
		for (const s of summaries) {
			for (const c of s.checks) {
				const p50Text = c.p50 === null ? "N/A" : formatMs(c.p50);
				const status = c.pass ? "✅ PASS" : "❌ FAIL";
				md.push(`| ${s.n} | ${s.mode} | ${s.variant} | ${c.metric} | ${p50Text} | ${formatMs(c.limit)} | ${status} |`);
			}
		}
		if (errors.length > 0) {
			md.push("");
			md.push("**Failures:**");
			for (const e of errors) md.push(`- ${e}`);
		}
		md.push("");
		await appendFile(summaryPath, `${md.join("\n")}\n`);
	}

	if (errors.length > 0) {
		console.error("Benchmark regression check failed:");
		for (const error of errors) {
			console.error(`- ${error}`);
		}
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
