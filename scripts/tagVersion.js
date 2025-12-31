/*
 * Inserts a version tag into the Supabase app_versions table.
 * Expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
    const version = pkg.version || "0.0.0";
    const source = process.env.TAG_SOURCE || "manual";
    const note = process.env.TAG_NOTE || null;

    const { error } = await supabase.from("app_versions").insert({
        version,
        source,
        note,
    });

    if (error) {
        console.error("Failed to insert version tag", error);
        process.exit(1);
    }

    console.log(`Tagged version ${version}${note ? ` (${note})` : ""}`);
}

main();
