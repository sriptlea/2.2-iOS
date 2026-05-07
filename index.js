const dl = require("./dl.js");
const zipFolder = require("./zipper");
const fs = require("fs");
const crypto = require("crypto");
const decompress = require("decompress");
const plist = require("plist");
require("dotenv").config();

function getInput(envKey, validateFn) {
    const value = process.env[envKey];

    if (!value) {
        console.error(`Missing required env variable: ${envKey}`);
        process.exit(1);
    }

    if (validateFn && !validateFn(value)) {
        console.error(`Invalid ${envKey}`);
        process.exit(1);
    }

    return value;
}

async function main() {
    const ICREATE_MODE = process.argv.includes("--icreate");

    const BASE_IPA_NAME = ICREATE_MODE ? "icreate.ipa" : "base.ipa";
    const BASE_IPA_LINK = ICREATE_MODE
        ? "https://objectstorage.us-phoenix-1.oraclecloud.com/n/axe9yayefpvx/b/iCreateVersions/o/iCreatePro_6.7.1.ipa"
        : "https://us-east-1.tixte.net/uploads/files.141412.xyz/base.ipa";

    const BASE_BUNDLE_ID = ICREATE_MODE
        ? "com.camila314.icreate"
        : "com.robtopx.geometryjump";

    console.log("2.2 maker for iOS - https://dimisaio.be\n");
    if (ICREATE_MODE) console.log("iCreate Pro mode\n");

    if (!fs.existsSync(BASE_IPA_NAME)) {
        await dl(BASE_IPA_LINK, BASE_IPA_NAME);
    }

    const name = getInput("name", v => v.trim().length > 0)
        .replaceAll(" ", "");

    const dir = `${name.toLowerCase()}-${crypto.randomBytes(8).toString("hex")}`;

    const bundle = getInput(
        "bundle",
        v => ICREATE_MODE ? v.length === 21 : v.length === 23
    );

    const base = getInput(
        "url",
        v => v.length === 33
    );

    const b64 = Buffer.from(base).toString("base64");
    const url = `${base}/`;

    const appPath = `${dir}/Payload/${name}.app`;

    console.log(`Decompressing ${BASE_IPA_NAME}\n`);
    await decompress(BASE_IPA_NAME, dir);

    console.log("Editing IPA...\n");

    await fs.promises.rename(`${dir}/Payload/GeometryJump.app`, appPath);
    await fs.promises.rename(`${appPath}/GeometryJump`, `${appPath}/${name}`);

    // -------------------------
    // CLEAN INFO.PLIST PATCH
    // -------------------------
    const plistPath = `${appPath}/Info.plist`;
    const plistData = plist.parse(
        await fs.promises.readFile(plistPath, "utf8")
    );

    plistData.CFBundleDisplayName = name;
    plistData.CFBundleName = name;
    plistData.CFBundleIdentifier = bundle;

    // IMPORTANT: modern safe compatibility
    plistData.MinimumOSVersion = "12.0";

    // REMOVE DEVICE WHITELISTS COMPLETELY (fixes iPhone 13 issue)
    delete plistData.UISupportedDevices;
    delete plistData.UIRequiredDeviceCapabilities;

    await fs.promises.writeFile(
        plistPath,
        plist.build(plistData),
        "utf8"
    );

    // -------------------------
    // PATCH EXECUTABLE (your logic kept)
    // -------------------------
    let gd = await fs.promises.readFile(`${appPath}/${name}`);

    gd = gd
        .toString("binary")
        .replaceAll(BASE_BUNDLE_ID, bundle)
        .replaceAll("https://www.boomlings.com/database", url)
        .replaceAll(
            "aHR0cDovL3d3dy5ib29tbGluZ3MuY29tL2RhdGFiYXNl",
            b64
        );

    await fs.promises.writeFile(`${appPath}/${name}`, gd, "binary");

    // -------------------------
    // OPTIONAL ICREATE HOOK
    // -------------------------
    if (ICREATE_MODE) {
        let icreate = await fs.promises.readFile(`${appPath}/hook.dylib`);

        icreate = icreate
            .toString("binary")
            .replaceAll(BASE_BUNDLE_ID, bundle)
            .replaceAll("com.camila314.icreate", bundle);

        await fs.promises.writeFile(`${appPath}/hook.dylib`, icreate, "binary");
    }

    console.log("Compressing...\n");

    await zipFolder(dir, `${name}.ipa`);

    await fs.promises.rm(dir, { recursive: true, force: true });

    console.log("Done!");
}

main();
