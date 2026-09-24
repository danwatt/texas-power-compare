# Current — Texas power usage

A dependency-free, browser-only Smart Meter Texas CSV explorer. No backend, external assets, analytics, or upload service. Personal readings are saved in this browser’s localStorage and restored on reload. Clear data deletes the saved copy. Demo data is never saved and does not overwrite your saved imports.

## Use offline

Download the project and open `index.html` in a modern browser. Keep `index.html`, `styles.css`, `data.js`, `storage.js`, `plans.js`, `plan-ui.js`, and `app.js` together. No installation or server is needed. Accessing Smart Meter Texas and its linked guide requires internet access; analysis does not. A previously visited hosted page is not guaranteed to reopen offline: download the files for reliable offline use.

Choose one or multiple 15-minute CSV reports, or try the clearly labeled synthetic demo year. Later imports add to the current data, replacing older revisions of overlapping readings. Imports replace demo data. Select a meter, date range, and grid consumption or solar exports. Switch the heatmap between months and Sunday-based weeks. Select or focus chart cells/bars to see values; monthly summaries can be exported as CSV.

## GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included workflow deploys automatically after every push to `main`. You can also run it manually from the repository’s **Actions** tab.

No build step, secrets, or dependencies are required. All asset paths are relative, so project Pages URLs work. Only application code belongs in the repository; do not commit personal CSVs.

## Development

Run `npm test` (Node 18+). Optionally use `npm start` (Python 3) to serve at http://localhost:8000. Neither requires installing packages.

## Data and methodology

- Accepts the eight columns in the Smart Meter Texas 15-minute export, BOM, CRLF, quoted CSV, and preamble rows. Invalid records are skipped with a count; a file with no valid readings is rejected. A multi-file import is atomic if a file fails.
- Meter IDs stay strings. Multiple meters are analyzed individually.
- Deduplication key: meter, local date, start time, energy type. Latest revision wins; equal revisions keep the last imported record.
- Heatmap and daily profiles sum four distinct quarter-hours, then average complete hourly observations. Incomplete hours are excluded rather than treated as zero. Missing cells are hatched.
- Monthly totals include every valid interval in the selected range; missing intervals are never extrapolated. Striped bars flag incomplete coverage within that range. These are calendar totals, not utility billing-cycle totals.
- Daily averages use 96-interval days only. Coverage uses 96 expected readings per day. Peak kW is the maximum interval kWh multiplied by four.
- CSV local clock times have no UTC offset or repeated-hour marker. DST spring days may have 92 readings; fall days may have 100. Repeated clock intervals cannot be distinguished from duplicate/revised data by this schema; deduplication can undercount fall-back usage. The UI discloses this limitation. No claim of billing-grade accuracy is made.
- Solar exports stay separate from grid consumption. Neither reports gross solar production or behind-the-meter consumption.
- “Latest 12 months” selects the latest month represented in the meter's data and the preceding eleven calendar months, ending at the last available day. Both end months can be partial.

Instructions are based on the [official Smart Meter Texas residential user guide](https://www.smartmetertexas.com/commonapi/gethelpguide/help-guides/Smart_Meter_Texas_Residential_User_Guide.pdf), dashboard and View Energy Data sections, checked September 2026.

Daily rhythm has its own period selector: dashboard dates, a calendar year, one or more seasons within that year, an inclusive month range (including across years), or a single month. Winter means January, February, and December of the selected calendar year. These filters only affect the daily rhythm; meter and energy type still follow the dashboard. Missing months are not filled with zeros.

## Local persistence

Imported readings use a versioned compact array format with dictionaries for repeated meter IDs, dates, and revision timestamps. Values retain their original numeric precision. A single atomic localStorage write replaces the saved dataset after a successful import. If quota or browser policy blocks saving, the import remains usable in memory, a visible message explains that it is unsaved, and any prior saved copy is retained. Storage is specific to the browser and site origin; localhost and GitHub Pages do not share data. Private browsing, clearing site data, or browser eviction can remove it. Keep the original CSV as a backup. Persistence for `file://` pages depends on the browser; serving the app from localhost or GitHub Pages is recommended for reliable storage. Only readings and import counts persist; chart filters reset on reload.

## Plan comparisons

Add any number of provider/plan definitions. Enter utility delivery per kWh, monthly utility base, energy per kWh, zero or more threshold credits, and optional free-energy times (default 21:00–07:00, editable in 15-minute steps). New plans default to explicit cents/kWh fields, with dollars/kWh available as an alternative. Previously saved auto-unit rates open with their equivalent explicit unit without changing the rate. The rate is previewed before saving. Mark one plan as your current plan to see period savings; cards and table columns sort by estimated cost, with ties labeled. Savings use recorded-month totals and are never annualized from partial data. Duplicate opens a prefilled editor and creates a separate alternative only when saved; it does not inherit the current-plan designation. The current-plan designation persists with plans and is included in share links. Base charges and bill credits are always dollars.

Use the Usage, Compare plans, and Add appliances tabs to switch tasks. After usage loads, a compact header offers Add CSVs and Manage data; Exit demo returns to saved imports without deleting them. Deleting usage requires confirmation in Manage data.

The comparison uses the selected meter’s grid consumption and defaults to the full calendar months covered by the analysis period (independent of the consumption/export toggle). Select “Use a different comparison period” to choose the latest 12 calendar months or an individual calendar year. Usage charts and appliance scenarios use the exact analysis dates; the daily rhythm can use its own labeled period. Each plan displays the total, monthly average, effective cents/kWh, and a monthly bill table with clickable charge breakdowns. Missing months are excluded from totals and averages. Partial months use available readings and the full base charge, are marked with an asterisk, and are not represented as a complete annual estimate. Zero-usage months with readings still incur the base fee.

Qualifying credits stack and apply when total recorded monthly consumption is at least the threshold, including usage in free hours. Daily free windows are start-inclusive and end-exclusive; overnight windows wrap midnight. Alternatively, select a continuous weekly window with start/end weekdays and whole hours. Weekly windows include the entire ending hour: the default is Friday 19:00 through Sunday 23:59:59. Weekly windows wrap across Sunday and are applied to each interval’s local calendar day, including month/year boundaries. Existing saved free-night plans retain their daily behavior. Delivery is charged on all consumption. Component charges and individual credits are rounded to cents before summing; monthly bills have a $0 floor, with no carryover. No taxes, additional provider fees, export compensation, or utility billing-cycle adjustments are modeled. User-supplied rates apply uniformly across the comparison period. DST limitations described above also apply here.

Plan definitions persist separately under `current:plans:v1`; demo usage does not replace saved usage, but plans edited while viewing the demo are still saved. Clearing usage retains plans; each plan has its own Remove action. No live provider prices are fetched.

## Sharing a comparison

Use **Share comparison** to create a self-contained URL. The Base64 URL fragment includes the displayed comparison period’s monthly total kWh, reading/estimated counts, and 7 × 24 weekday/hour kWh totals, plus the plan definitions currently on screen. It is enough to reproduce monthly delivery, energy, credit, free-night, and free-weekend estimates, while excluding ESI IDs, meter numbers, addresses, source CSV text, dates within a month, and individual 15-minute readings. New links use a compact binary format with a one-byte hourly bucket. The app chooses the coarsest 0.01 kWh increment that keeps every included monthly bill within 2% of its browser calculation, then packs the values before Base64 encoding. A 12-month link with a plan is typically about 3–4 KB. Earlier JSON and first-generation binary links remain supported.

The link is not encrypted: anyone with it can decode and use the included anonymous energy profile and plan names. Recipients open directly into the plan comparison, with their own saved dashboard data left untouched. They can change plans in that tab and create an updated link. A recipient can choose **Exit shared view** to remove the URL fragment and return to their own app state.

Because shared data is hourly, plans with daily free-energy boundaries at 15-minute increments cannot be represented exactly. The share action asks the sender to use whole-hour start and end times first. Free-weekend plans already use whole-hour boundaries. Shared links are intentionally limited to 120 months and 50 plans, and malformed data is rejected before rendering.

## Added-load screener

The private dashboard includes an added-load screener for early planning of an EV charger, induction cooktop, or other scheduled load. Enter the main-service rating, service voltage, and a planning percentage, then add loads with a nameplate/charger kW value, schedule, active days, and a continuous-load checkbox. The EV template starts at 7.7 kW and applies a 125% planning factor; the induction template starts at 10 kW without that factor. The screener adds these modeled loads to every imported 15-minute grid-consumption interval and reports the measured peak, modeled peak, selected planning capacity, headroom, intervals above target, and the three highest modeled intervals.

This is a private, historical screening aid only, not a code-compliant service or panel load calculation and not an installation approval. Smart Meter Texas readings are 15-minute average grid consumption, so they can miss shorter peaks. Solar/battery generation or discharge can also make grid consumption lower than total home demand. The screener does not know the main breaker, bus rating, conductor/feeder ratings, existing fixed appliances, breaker spaces, appliance nameplates, load diversity, permits, or local code. A qualified electrician must use actual equipment nameplates and the applicable load-calculation method before adding a circuit. The 80% default is a configurable planning target, not a code determination.

For context, the U.S. Department of Energy notes that EV charging is treated as a continuous load and describes a 32 A, 240 V Level 2 EVSE as requiring a 40 A circuit. Its Better Buildings material notes that induction ranges/cooktops commonly use a 40–50 A, 240 V connection and may require a panel upgrade when replacing gas cooking. See [DOE’s home EV charging guide](https://afdc.energy.gov/fuels/electricity-charging-home), [DOE EVSE training](https://stage.energy.gov/cmei/femp/articles/electric-vehicle-supply-equipment-infrastructure-federal-fleet-training), and [induction cooking guidance](https://betterbuildingssolutioncenter.energy.gov/sites/default/files/attachments/induction_cooking_101.pdf).
