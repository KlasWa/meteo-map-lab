# SMHI metobs Cloud Parameters: Layer-wise Cloud Amount, Reporting Convention, and the "Max Octas" Method

## TL;DR
- **Parameters 29/31/33/35 ARE the four layer-wise cloud-amount parameters ("Molnmängd, lägsta/andra/tredje/fjärde molnlager"),** reported in oktas. Total cloud cover ("Total molnmängd") is parameter **16** (unit: percent).
- **SMHI reports per-layer cloud amount CUMULATIVELY, following the WMO SYNOP "summation principle."** SMHI's own documentation states the layers are selected as: lowest layer of any amount; the next-higher layer that *"sammanlagt täcker 3/8 eller mer"* (together covers 3/8 or more); the next-higher that *"sammanlagt täcker 5/8 eller mer"* (together covers 5/8 or more). The word **"sammanlagt" (= cumulatively/in total)** is the decisive evidence. Each layer's reported amount therefore includes the sky already covered by lower layers and can never be less than a lower layer.
- **Because reporting is cumulative, "MAX octas across the four layers" IS a valid estimate of total cloud cover** — in fact, under the summation principle the highest-numbered reported layer already *equals* the total sky cover. The method would only fail under an independent/per-layer convention, which is NOT what SMHI uses. The main caveats are the okta→% mismatch with parameter 16, the code-9 (obscured) and empty METAR-reserved codes (10–15), and the fact that automatic ceilometers can miss thin/high cloud.

## Key Findings

**1. Parameter map (from the live SMHI metobs API, `…/api/version/latest.json`, and the SMHI "Signifikanta moln" metadata record 9c97c702-7c6e-4c0b-b99b-f23d9a1a1422):**

| Param | Title (SMHI) | English | Unit | Description |
|---|---|---|---|---|
| **16** | Total molnmängd | Total cloud amount | **procent (%)** | Total cloud cover, momentanvärde 1×/h (automatic) or assessed every 3 h (manual). 0–100%; **113% = sky not assessable** (fog/precip). |
| **29** | Molnmängd, lägsta molnlager | Cloud amount, lowest (1st) layer | **kod** (oktas 0–9) | "Molnmängd, lägst förekommande moln oavsett molnmängd." Cloud base = param 28. |
| **31** | Molnmängd, andra molnlager | Cloud amount, 2nd layer | kod (oktas) | "Molnmängd, nästa högre (andra) molnskikt." Cloud base = param 30. |
| **33** | Molnmängd, tredje molnlager | Cloud amount, 3rd layer | kod (oktas) | "Molnmängd, nästa högre (tredje) molnskikt." Cloud base = param 32. |
| **35** | Molnmängd, fjärde molnlager | Cloud amount, 4th layer | kod (oktas) | "Molnmängd, nästa högre (fjärde) molnskikt." Cloud base = param 34. |
| 28/30/32/34 | Molnbas, 1st–4th layer | Cloud base, layers 1–4 | meter | Cloud base height per layer; "Mängden av dessa moln återfinns under parameter 29/31/33/[35]." |
| 36 | Molnbas, lägsta | Lowest cloud base (on the hour) | meter | — |
| 37 | Molnbas, lägsta (min 15 min) | Lowest cloud base, 15-min minimum | meter | — |

**2. The okta code table for parameters 29/31/33/35** (verbatim from `…/parameter/29/codes.json`): 0 = "Himlen helt molnfri"; 1–6 = "N/8 av himlen täckt med moln"; 7 = "7/8 av himlen eller mera, dock ej heltäckt"; 8 = "Himlen helt täckt med moln…"; **9 = "Molnmängden kan ej observeras på grund av dimma eller högt och tätt snödrev…"**; 10 = partly obscured; 11 = spridda moln (scattered); 12 = brutet molntäcke (broken); 13 = enstaka moln (few); 14 = reserved; 15 = not observable/not performed. SMHI documentation also notes **values 10–15 are reserved for METAR airport observations and are empty in this dataset.**

**3. The cumulative ("summation principle") convention — verbatim SMHI wording.** From the SMHI metadata for the layered cloud datasets:
> "För manuella stationer rapporteras följande moln: – Lägsta förekommande molnskikt oberoende av dess molnmängd, som minst rapporteras 1/8. – Därnäst högre molnskikt som **sammanlagt** täcker 3/8 eller mer av himlen. – Därnäst högre molnskikt som **sammanlagt** täcker 5/8 eller mer av himlen. … Molnbas för varje molnskikt rapporteras. Ex: 1/8 på 300 m, 3/8 på 500 m och 5/8 på 1000 m."

This is the SMHI implementation of the WMO SYNOP **8NsChshs** group selection rule (confirmed against WMO/UKMO SYNOP references): "Up to four layers of significant cloud can be reported. The rules for the selection of significant cloud layers are: 1. The lowest layer of any amount. 2. The next lowest layer of **3 oktas or more**. 3. The next lowest layer of **5 oktas or more**. 4. Any cumulonimbus not already reported." The matching meteorological definition (McGraw-Hill / NWS "summation principle"): *"the sky cover at any level is equal to the summation of the sky cover of the lowest layer plus the additional sky cover provided at all successively higher layers up to and including the layer in question; thus, no layer can be assigned a sky cover less than a lower layer, and no sky cover can be greater than 1.0."*

**Conclusion on the critical question: the values are CUMULATIVE, not independent.** The "3/8 or more" and "5/8 or more" thresholds are *running totals from the ground up*, so each successive reported layer's okta value is monotonically non-decreasing, and the **last (highest) reported non-special layer value equals total cloud cover in oktas**.

**4. Is "max octas across the four layers" correct? YES, under SMHI's convention.** Because the per-layer amounts are cumulative, the maximum across parameters 29/31/33/35 equals the value of the highest populated layer, which by construction equals total sky cover. Worked example from SMHI's own text (1/8 → 3/8 → 5/8 → say 8/8): max = 8/8 = total cover. Taking the max is therefore correct (and even taking just the *last* reported layer would suffice). **This method would be WRONG only under an independent/genus convention** (e.g., layer-1 covers 2/8 here, layer-2 covers 3/8 elsewhere, layer-3 covers 5/8 elsewhere), where layers can overlap or sum beyond the true total — but SMHI does not use that convention for these parameters. Caveats: (a) treat code **9** (and empty 10–15) as "not assessable," not as 9 oktas, or the max will be corrupted; (b) automatic ceilometers look straight up and can miss thin or high cloud (SMHI: the method "kan både överskatta och underskatta molnmängden"; givare with max height 3800 m flagged Red), so derived totals are less reliable than direct param 16 where it exists; (c) the okta→percent conversion to compare with param 16 uses 1 okta ≈ 12.5% (code 9 → 112.5/113%).

**5. Station coverage.** Confirmed live station counts (June 2026 API snapshot):
- Param **29** (layer 1): **213 stations**
- Param **31** (layer 2): **176 stations**
- Param **33** (layer 3): **148 stations**
- Param **35** (layer 4): **115 stations**

The counts decline monotonically with height (213 → 176 → 148 → 115), which is physically sensible (higher layers are reported less often). For **param 16 (total cloud cover)**, the full station-list could not be counted directly (the API listing endpoint blocked programmatic fetch), but the live `parameter/16/station-set/all/period/latest-hour/data.csv` returned roughly **~110 actively reporting stations in the most recent hour** (Abisko Aut … Överkalix-Svartbyn A). The historical/registered station total for param 16 is large because total cloud cover has been recorded since the manual era (e.g., Uråsa from 1962) at far more sites than ceilometer-equipped automatic stations. **Therefore the layer-1 amount (param 29, 213 stations) is available on MORE stations than the *currently active* total-cloud-cover feed, but param 16 has the deeper historical record.** Note these are different physical quantities and different units (oktas vs %), so they are complements, not substitutes.

## Details

**Authoritative documentation references (link directly to these):**
- metobs API parameter resource & docs: `https://opendata.smhi.se/metobs/resources/parameter` and `https://opendata.smhi.se/apidocs/metobs/parameter.html`
- Live parameter list (all IDs, titles, units): `https://opendata-download-metobs.smhi.se/api/version/latest.json`
- Per-parameter listing (stations): `https://opendata-download-metobs.smhi.se/api/version/latest/parameter/{29|31|33|35|16}.json`
- Okta code table for layer amounts: `https://opendata-download-metobs.smhi.se/api/version/latest/parameter/29/codes.json` (also 31/33/35)
- SMHI dataset metadata "Signifikanta moln, timvärden" (defines 28–35): catalog record `9c97c702-7c6e-4c0b-b99b-f23d9a1a1422` (`https://opendata-catalog.smhi.se/md/9c97c702-7c6e-4c0b-b99b-f23d9a1a1422`); mirrored verbatim at the Arctic SDI catalogue page for "Molnmängd."
- SMHI Kunskapsbanken on cloud amount: `https://www.smhi.se/kunskapsbanken/meteorologi/molnighet/molnighet-och-molnmangd-1.1514` and `…/moln/molnighet` — confirms oktas 0–8, code 9 = obscured, "kod 9 sätts till 112,5%," and that automatic ceilometers compute amount from laser hits over 30 min (last 10 min weighted double).
- SMHI "Total molnmängd timvärde" dataset page: `https://www.smhi.se/data/utforskaren-oppna-data/se-acmf-meteorologiska-observationer-total-molnmangd-timvarde`
- WMO/SYNOP supporting context: SYNOP FM-12 **8NsChshs** group, "Ns = Amount of individual cloud layer (Table 5)"; selection rules (lowest/3-okta/5-okta/CB); WMO Code 2700 (N total cloud cover 0–8, 9 = obscured). WMO International Cloud Atlas distinguishes *total cloud cover* (all visible cloud) from *cloud amount* (a genus/layer/combination).

**Practical extraction notes:**
- Param 16 values are integer percents (0, 13, 25, 38, 50, 63, 75, 88, 100, and 113 for obscured) — these correspond to oktas × 12.5% rounded, confirming the okta basis.
- Quality flags: G (green = approved), Y (yellow = suspect/aggregated), R (red, not delivered — includes ceilometer with 3800 m ceiling that misses high cloud).
- For the layer parameters the `unit` field is literally `kod` (code), and you must resolve values via the `/codes.json` table; do not treat raw 9–15 as octa counts.

## Recommendations

1. **To derive total cloud cover from layers, take the MAX of the valid okta values across 29/31/33/35** (equivalently, the last populated layer), then convert oktas → % via ×12.5 if you need to align with param 16. This is correct *because SMHI uses the cumulative summation principle*.
2. **Sanitize codes before taking the max:** drop/flag values 9 (obscured), and 10–15 (obscured-partial / METAR-reserved-empty / not-observed). Map 8 → 100%, 9 → 113% (obscured), and treat 11/12/13 (scattered/broken/few) only if you specifically intend to use METAR-style categories — in the standard SMHI obs feed these are largely empty.
3. **Prefer param 16 where available** (it is the institute's canonical total-cover series with the longest history and is already a single clean number); fall back to the layer-max only for stations/periods where 16 is missing. Cross-check the two: if max-octa-% and param 16 diverge by more than ~1 okta (12.5%) routinely at a station, suspect a high-cloud-missing ceilometer (Red-flag givare).
4. **Benchmarks that would change the approach:** if a station's layer-max systematically *exceeds* param 16, or if you find layer values that are non-monotonic (a higher layer reporting fewer oktas than a lower one) in real data, that would indicate the data are NOT cumulative for that station/source — investigate before trusting the max method there. Absent such evidence, the cumulative interpretation holds.

## Caveats
- **The param-16 active-station count (~110 in the latest hour) is a single-hour snapshot, not the full registered-station total**, which I could not enumerate because the parameter-16 listing endpoint blocked direct fetch; the layer counts (213/176/148/115) are confirmed exact. Treat the 16-vs-29 comparison as: layer-1 is on more stations than the live total-cover feed, but param 16 has a much larger historical footprint. Verify your specific station set directly via the API.
- SMHI's layer-selection text is explicitly framed "för manuella stationer" (for manual stations, mostly historical). Automatic ceilometer stations "rapporterar alla molnlager som instrumentet detekterar, dock max 4 molnlager," with amount computed by an instrument algorithm — the cumulative monotonicity is a property of the SYNOP coding model; for automatic stations confirm empirically that values remain non-decreasing by layer.
- Oktas (layers, param 29/31/33/35) and percent (param 16) are different units and the conversion is coarse (12.5% per okta); the two series are not bit-for-bit comparable.
- Code 9 / 113% means "sky not observable" (fog, heavy snow drift), NOT 9 oktas of cloud — a common and serious data-cleaning trap when computing a max.
- Some interpretive context (METAR FEW/SCT/BKN/OVC, the McGraw-Hill "summation principle" wording, SYNOP table references) comes from aviation/WMO secondary sources rather than SMHI itself; they are consistent with SMHI's "sammanlagt" wording but are supporting context, not SMHI primary text.