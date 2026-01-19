import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import fsSync from 'fs';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { config } from './config.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let botMode = config.mode.default;

async function loadOwners() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'owners.json'), 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveOwners(owners) {
    await fs.writeFile(path.join(__dirname, 'owners.json'), JSON.stringify(owners, null, 2));
}

function normalizeNumber(num) {
    if (!num) return null;
    const number = num.replace(/[^\d]/g, '');
    if (number.startsWith('0')) return '62' + number.slice(1);
    if (number.startsWith('8')) return '62' + number;
    if (number.startsWith('+')) return number.slice(1);
    return number.startsWith('62') ? number : null;
}

const groupSettingsFile = path.join(__dirname, 'groupSettings.json');
const warningFile = path.join(__dirname, 'warnings.json');

async function loadGroupSettings() {
    try {
        return JSON.parse(await fs.readFile(groupSettingsFile, 'utf8'));
    } catch {
        return {};
    }
}

async function saveGroupSettings(data) {
    await fs.writeFile(groupSettingsFile, JSON.stringify(data, null, 2));
}

async function loadWarnings() {
    try {
        return JSON.parse(await fs.readFile(warningFile, 'utf8'));
    } catch {
        return {};
    }
}

async function saveWarnings(data) {
    await fs.writeFile(warningFile, JSON.stringify(data, null, 2));
}
const blJpmFile = path.join(__dirname, 'bljpm.json');

async function loadBlJpm() {
    try {
        return JSON.parse(await fs.readFile(blJpmFile, 'utf8'));
    } catch {
        return [];
    }
}

async function saveBlJpm(data) {
    await fs.writeFile(blJpmFile, JSON.stringify(data, null, 2));
}
const autoPromoFile = path.join(__dirname, 'autopromo.json');

async function loadAutoPromo() {
    try {
        return JSON.parse(await fs.readFile(autoPromoFile, 'utf8'));
    } catch {
        return {
            status: false,
            text: '',
            delay: 1,
            lastReply: {}
        };
    }
}

async function saveAutoPromo(data) {
    await fs.writeFile(autoPromoFile, JSON.stringify(data, null, 2));
}
// ==================== DATABASE HELPER ====================
const dbPath = path.join(__dirname, 'database.json');

async function getDb() {
    try {
        // Cek apakah file ada, jika tidak ada masuk ke catch
        const data = await fs.readFile(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Jika file tidak ada, buat file baru dengan struktur awal
        const initialDb = { 
            antilink: [], 
            antitoxic: [], 
            welcome: [], 
            produk: [] 
        };
        await fs.writeFile(dbPath, JSON.stringify(initialDb, null, 2));
        return initialDb;
    }
}

async function saveDb(db) {
    try {
        await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Gagal menyimpan database:', error);
    }
}
// ==========================================================

export async function handleMessage(sock, msg, text, metadata) {
    const { senderNumber, isGroup, from, isOwner } = metadata;
    // ================= AUTOPROMO AUTO REPLY =================
const promo = await loadAutoPromo();

if (promo.status && !isOwner) {
    const now = Date.now();
    const chatId = isGroup ? from : senderNumber;

    const last = promo.lastReply[chatId] || 0;
    const delayMs = promo.delay * 60 * 1000;

    if (now - last >= delayMs) {
        await sock.sendMessage(from, { text: promo.text });
        promo.lastReply[chatId] = now;
        await saveAutoPromo(promo);
    }
}
    if (botMode === 'self' && !isOwner) return;
    // ===== ANTILINK CHECK =====
if (isGroup && !isOwner) {
    const settings = await loadGroupSettings();
    const groupSet = settings[from];

    if (groupSet?.antilink) {
        const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com)/gi;

        if (linkRegex.test(text)) {
            const warnings = await loadWarnings();
            warnings[from] = warnings[from] || {};
            warnings[from][senderNumber] = (warnings[from][senderNumber] || 0) + 1;

            const count = warnings[from][senderNumber];

            await saveWarnings(warnings);

            if (count >= 3) {
                try {
                    await sock.groupParticipantsUpdate(from, [senderNumber + '@s.whatsapp.net'], 'remove');
                    await sock.sendMessage(from, {
                        text: `❌ @${senderNumber} dikeluarkan (3x melanggar antilink).`,
                        mentions: [senderNumber + '@s.whatsapp.net']
                    });
                } catch {
                    await sock.sendMessage(from, { text: '❌ Gagal kick user (bot bukan admin).' });
                }
            } else {
                await sock.sendMessage(from, {
                    text: `⚠️ @${senderNumber} LINK TERDETEKSI!\nPeringatan ${count}/3`,
                    mentions: [senderNumber + '@s.whatsapp.net']
                });
            }
            return;
        }
    }
}
    const prefix = '.';
    if (!text.startsWith(prefix)) return;
    
    const command = text.slice(prefix.length).trim().split(' ')[0].toLowerCase();
    const args = text.slice(prefix.length + command.length).trim();
    
    switch(command) {
    case 'menu': {
        const ownersList = await loadOwners();
        const menuText = `
╔═❏ *${config.bot.name}*
║ Versi: ${config.bot.version}
║ Mode: ${botMode.toUpperCase()}
║ Owner: ${ownersList.length}
║ Dev: ${config.developer.name}
╚═❏

  ╭◙  *Other Menu*
  ┆• .pushkontak
  ┆• .jedapush
  ┆• .jedajpm
  ┆• .jpm
  ┆• .bljpm
  ┆• .listbljpm
  ┆• .delbljpm
  ┆• .cekidch
  ╰◙͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏͏
  ╭◙  *Main Menu*
  ┆• .igdownload
  ┆• .removebg
  ┆• .suarateks
  ┆• .emojimix
  ┆• .pinterest
  ┆• .ttsearch
  ┆• .gimage
  ┆• .bratvid
  ┆• .ssweb
  ┆• .ffstalk
  ┆• .tiktok
  ┆• .brat
  ┆• .sfile
  ╰◙
  ╭◙  *Tools Media*
  ┆• .tourlv1
  ┆• .tourlv2
  ┆• .tourlv3
  ╰◙
  ╭◙  *Store Menu*
  ┆• .listproduk
  ┆• .addproduk
  ┆• .autopromo
  ┆• .setpromo
  ┆• .payment
  ╰◙
  ╭◙  *Create Panel*
  ┆• .delserver IDServer
  ┆• .delpanel IDUser
  ┆• .deluser IDUser
  ┆• .clearserver
  ┆• .clearuser
  ┆• .listpanel
  ┆• .1gb
  ┆• .unli
  ┆• .cadmin
  ╰◙
  ╭◙  *Group Menu*
  ┆• .listgrup
  ┆• .status grup
  ┆• .antilink
  ┆• .welcome
  ┆• .hidetag
  ┆• .kick
  ┆• .add
  ╰◙
  ╭◙  *Owner Menu*
  ┆• .addowner <nomor>
  ┆• .delowner <nomor>
  ┆• .listowner
  ┆• .restart
  ┆• .public
  ┆• .self
  ┆• .backup
  ╰◙
`;

        await sock.sendMessage(from, {
            text: menuText,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363402625644245@newsletter',
                    newsletterName: '© Fyxzpedia Developer',
                    serverMessageId: -1
                },
                externalAdReply: {
                    title: 'NextBot Premium',
                    body: 'Premium NextBot v3.0.0',
                    thumbnailUrl: 'https://files.catbox.moe/0s9yn1.jpg',
                    sourceUrl: 'https://whatsapp.com/channel/0029VbBouHp0rGiGXagM0f2e', // Klik gambar ke saluran
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    showAdAttribution: true 
                }
            }
        }, { quoted: msg });
        break;
    }

case 'refreshbot':
case 'restart': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' }, { quoted: msg });
    
    // Memberi notifikasi ke WhatsApp sebelum proses mati
    await sock.sendMessage(from, { 
        text: '♻️ *Restarting System...*\n\nSedang mematikan proses untuk memuat ulang seluruh script. Bot akan aktif kembali dalam beberapa detik jika menggunakan PM2/Panel.' 
    }, { quoted: msg });

    // Memberikan jeda 1 detik agar pesan terkirim dulu sebelum proses dihentikan
    setTimeout(() => {
        process.exit(); 
    }, 1000);
}
break;



        case 'public': {
            if (!isOwner) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
                return;
            }
            botMode = 'public';
            await sock.sendMessage(from, { text: '✅ Mode bot diubah ke PUBLIC.' });
            break;
        }
        
        case 'self': {
            if (!isOwner) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
                return;
            }
            botMode = 'self';
            await sock.sendMessage(from, { text: '✅ Mode bot diubah ke SELF.' });
            break;
        }
        
        case 'addowner': {
            if (!isOwner) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
                return;
            }
            
            const num = normalizeNumber(args);
            if (!num) {
                await sock.sendMessage(from, { text: '❌ Format nomor salah. Contoh: .addowner 6281234567890' });
                return;
            }
            
            const ownersList = await loadOwners();
            if (ownersList.includes(num)) {
                await sock.sendMessage(from, { text: '❌ Nomor sudah terdaftar sebagai owner.' });
                return;
            }
            
            ownersList.push(num);
            await saveOwners(ownersList);
            await sock.sendMessage(from, { text: `✅ Owner ${num} berhasil ditambahkan.` });
            break;
        }
        
        case 'delowner': {
            if (!isOwner) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
                return;
            }
            
            const num = normalizeNumber(args);
            if (!num) {
                await sock.sendMessage(from, { text: '❌ Format nomor salah. Contoh: .delowner 6281234567890' });
                return;
            }
            
            const ownersList = await loadOwners();
            const botNumber = normalizeNumber(sock.user?.id?.split(':')[0]);
            if (num === botNumber) {
                await sock.sendMessage(from, { text: '❌ Tidak bisa menghapus owner utama (nomor bot).' });
                return;
            }
            
            const index = ownersList.indexOf(num);
            if (index === -1) {
                await sock.sendMessage(from, { text: '❌ Nomor tidak ditemukan di database owner.' });
                return;
            }
            
            ownersList.splice(index, 1);
            await saveOwners(ownersList);
            await sock.sendMessage(from, { text: `✅ Owner ${num} berhasil dihapus.` });
            break;
        }
        
        case 'listowner': {
            if (!isOwner) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
                return;
            }
            
            const ownersList = await loadOwners();
            let list = '╔═══════════════════════════╗\n║       DAFTAR OWNER        ║\n╠═══════════════════════════╣\n';
            
            if (ownersList.length === 0) {
                list += '║    Tidak ada owner        ║\n';
            } else {
                ownersList.forEach((owner, i) => {
                    list += `║ ${i + 1}. ${owner}\n`;
                });
            }
            list += '╚═══════════════════════════╝';
            
            await sock.sendMessage(from, { text: list });
            break;
        }
        
        case 'sticker': {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const message = quoted || msg.message;
            
            if (!message?.imageMessage && !message?.videoMessage) {
                await sock.sendMessage(from, { text: '❌ Kirim gambar/video atau reply gambar/video dengan caption .sticker' });
                return;
            }
            
            try {
                const mediaType = message.imageMessage ? 'image' : 'video';
                const mediaKey = message.imageMessage?.mediaKey || message.videoMessage?.mediaKey;
                const mediaData = mediaType === 'image' ? message.imageMessage : message.videoMessage;
                
                if (!mediaKey) {
                    await sock.sendMessage(from, { text: '❌ Media tidak valid.' });
                    return;
                }
                
                const stream = await downloadContentFromMessage(mediaData, mediaType);
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                
                const sticker = new Sticker(buffer, {
                    pack: config.bot.name,
                    author: 'Fyxzpedia',
                    type: StickerTypes.FULL,
                    categories: ['🤩', '🎉'],
                    id: '12345',
                    quality: 100,
                    background: '#000000'
                });
                
                await sock.sendMessage(from, await sticker.toMessage());
                
            } catch (error) {
                console.error('Sticker error:', error);
                await sock.sendMessage(from, { text: '❌ Gagal membuat sticker.' });
            }
            break;
        }
        
        case 'backup': {
            if (!isOwner) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
                return;
            }
            
            if (isGroup) {
                await sock.sendMessage(from, { text: '❌ Kirim command ini di private chat.' });
                return;
            }
            
            try {
                await sock.sendMessage(from, { text: '📦 Membuat backup...' });
                
                const backupFile = path.join(__dirname, 'backup.zip');
                const output = fsSync.createWriteStream(backupFile);
                const archive = archiver('zip', { zlib: { level: 9 } });
                
                output.on('close', async () => {
                    try {
                        const stats = fsSync.statSync(backupFile);
                        const fileSize = (stats.size / (1024 * 1024)).toFixed(2);
                        
                        await sock.sendMessage(from, {
                            text: `📤 Uploading backup (${fileSize} MB)...`
                        });
                        
                        await sock.sendMessage(from, {
                            document: { url: backupFile },
                            fileName: `backup-${new Date().toISOString().split('T')[0]}.zip`,
                            mimetype: 'application/zip'
                        });
                        
                        await fs.unlink(backupFile);
                        
                    } catch (error) {
                        console.error('Backup upload error:', error);
                        await sock.sendMessage(from, { text: '❌ Gagal mengupload backup.' });
                    }
                });
                
                archive.on('error', async (err) => {
                    console.error('Backup error:', err);
                    await sock.sendMessage(from, { text: '❌ Gagal membuat backup.' });
                });
                
                archive.pipe(output);
                
                const files = await fs.readdir(__dirname);
                for (const file of files) {
                    const filePath = path.join(__dirname, file);
                    const stat = await fs.stat(filePath);
                    
                    if (config.backup.exclude.some(ex => file.includes(ex))) continue;
                    
                    if (stat.isDirectory()) {
                        archive.directory(filePath, file);
                    } else {
                        archive.file(filePath, { name: file });
                    }
                }
                
                await archive.finalize();
                
            } catch (error) {
                console.error('Backup error:', error);
                await sock.sendMessage(from, { text: '❌ Gagal membuat backup.' });
            }
            break;
        }
 
        case 'kick': {
            if (!isGroup) return await sock.sendMessage(from, { text: '❌ Perintah ini hanya bisa digunakan di grup!' });
            if (!isOwner) return await sock.sendMessage(from, { text: '❌ Hanya Owner Bot yang bisa menggunakan perintah ini.' });

            // Mengambil target dari tag/mention atau reply pesan
            let target;
            if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                target = msg.message.extendedTextMessage.contextInfo.participant;
            } else if (args) {
                target = normalizeNumber(args) + '@s.whatsapp.net';
            }

            if (!target) return await sock.sendMessage(from, { text: '❌ Tag/balas pesan member atau masukkan nomor yang ingin dikeluarkan.' });

            try {
                await sock.groupParticipantsUpdate(from, [target], 'remove');
                await sock.sendMessage(from, { text: `✅ Berhasil mengeluarkan @${target.split('@')[0]}`, mentions: [target] });
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Gagal mengeluarkan member. Pastikan Bot adalah Admin.' });
            }
            break;
        }

        case 'add': {
            if (!isGroup) return await sock.sendMessage(from, { text: '❌ Perintah ini hanya bisa digunakan di grup!' });
            if (!isOwner) return await sock.sendMessage(from, { text: '❌ Hanya Owner Bot yang bisa menggunakan perintah ini.' });

            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan nomor yang ingin ditambahkan.\nContoh: .add 62812345678' });

            // Membersihkan input nomor
            const target = normalizeNumber(args) + '@s.whatsapp.net';

            try {
                const response = await sock.groupParticipantsUpdate(from, [target], 'add');
                
                // Cek jika nomor diprivasi atau gagal
                if (response[0].status === "403") {
                    await sock.sendMessage(from, { text: '❌ Gagal menambahkan. Nomor tersebut membatasi privasi grup (Invite Only).' });
                } else if (response[0].status === "408") {
                    await sock.sendMessage(from, { text: '❌ Gagal menambahkan. Nomor baru saja keluar dari grup ini.' });
                } else {
                    await sock.sendMessage(from, { text: `✅ Berhasil menambahkan @${target.split('@')[0]}`, mentions: [target] });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: '❌ Gagal menambahkan nomor. Pastikan Bot adalah Admin.' });
            }
            break;
        }
case 'hidetag': {
    if (!isGroup) {
        await sock.sendMessage(from, { text: '❌ Perintah ini hanya bisa digunakan di grup.' });
        return;
    }

    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner bot.' });
        return;
    }

    if (!args) {
        await sock.sendMessage(from, {
            text: '❌ Masukkan teks.\nContoh: .hidetag Halo semua'
        });
        return;
    }

    try {
        const groupMetadata = await sock.groupMetadata(from);

        // AMBIL SEMUA MEMBER TANPA FILTER BERBAHAYA
        const participants = groupMetadata.participants.map(p => p.id);

        await sock.sendMessage(from, {
            text: args,
            mentions: participants
        });

    } catch (err) {
        console.error('Hidetag error:', err);
        await sock.sendMessage(from, { text: '❌ Gagal mengirim hidetag.' });
    }
    break;
}
case 'welcome': {
    if (!isGroup) return sock.sendMessage(from, { text: '❌ Khusus grup.' });
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });

    const settings = await loadGroupSettings();
    settings[from] = settings[from] || {};

    if (args === 'on') {
        settings[from].welcome = true;
        await sock.sendMessage(from, { text: '✅ Welcome diaktifkan.' });
    } else if (args === 'off') {
        settings[from].welcome = false;
        await sock.sendMessage(from, { text: '❌ Welcome dimatikan.' });
    } else {
        await sock.sendMessage(from, { text: '❓ Gunakan: .welcome on / off' });
        return;
    }

    await saveGroupSettings(settings);
    break;
}
case 'antilink': {
    if (!isGroup) return sock.sendMessage(from, { text: '❌ Khusus grup.' });
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });

    const settings = await loadGroupSettings();
    settings[from] = settings[from] || {};

    if (args === 'on') {
        settings[from].antilink = true;
        await sock.sendMessage(from, { text: '✅ Antilink diaktifkan.' });
    } else if (args === 'off') {
        settings[from].antilink = false;
        await sock.sendMessage(from, { text: '❌ Antilink dimatikan.' });
    } else {
        await sock.sendMessage(from, { text: '❓ Gunakan: .antilink on / off' });
        return;
    }

    await saveGroupSettings(settings);
    break;
}
case 'listgrup': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
        return;
    }

    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups);

        if (groupList.length === 0) {
            await sock.sendMessage(from, { text: 'Bot tidak berada di grup manapun.' });
            return;
        }

        let text = `Daftar Grup (${groupList.length})\n\n`;

        groupList.forEach((g, i) => {
            text += `${i + 1}. ${g.subject}\n`;
            text += `   ID: ${g.id}\n\n`;
        });

        await sock.sendMessage(from, { text });

    } catch (err) {
        console.error('listgrup error:', err);
        await sock.sendMessage(from, { text: 'Gagal mengambil daftar grup.' });
    }
    break;
}
case 'status': {
    if (!isGroup) {
        await sock.sendMessage(from, { text: 'Perintah ini hanya bisa digunakan di grup.' });
        return;
    }

    if (!isOwner) {
        await sock.sendMessage(from, { text: 'Command ini hanya untuk owner.' });
        return;
    }

    if (args !== 'grup') return;

    try {
        const meta = await sock.groupMetadata(from);
        const admins = meta.participants.filter(p => p.admin);
        const owner =
            meta.owner ||
            meta.participants.find(p => p.admin === 'superadmin')?.id;

        let text = `Status Grup\n\n`;
        text += `Nama Grup      : ${meta.subject}\n`;
        text += `ID Grup        : ${meta.id}\n`;
        text += `Owner Grup     : ${owner ? '@' + owner.split('@')[0] : 'Tidak diketahui'}\n`;
        text += `Total Member   : ${meta.participants.length}\n`;
        text += `Total Admin    : ${admins.length}\n`;
        text += `Tanggal Dibuat : ${new Date(meta.creation * 1000).toLocaleString()}\n`;
        text += `Deskripsi Grup : ${meta.desc || 'Tidak ada'}\n`;

        await sock.sendMessage(from, {
            text,
            mentions: owner ? [owner] : []
        });

    } catch (err) {
        console.error('status grup error:', err);
        await sock.sendMessage(from, { text: 'Gagal mengambil status grup.' });
    }
    break;
}
case 'cekidch': {
    // Validasi isOwner dihapus agar semua orang bisa menggunakan
    if (!text) return sock.sendMessage(from, { text: 'Contoh: .cekidch https://whatsapp.com/channel/xxxx' }, { quoted: msg });

    try {
        // Cek apakah link mengandung domain whatsapp channel
        if (!text.includes('whatsapp.com/channel/')) {
            return sock.sendMessage(from, { text: '❌ Link tidak valid! Pastikan itu adalah link Saluran WhatsApp.' }, { quoted: msg });
        }

        await sock.sendMessage(from, { text: '⏳ Sedang mengecek ID saluran, mohon tunggu...' }, { quoted: msg });

        // Mengambil kode undangan dari URL
        const inviteCode = text.split('/channel/')[1];
        
        // Mengambil metadata Newsletter secara valid
        const metadata = await sock.newsletterMetadata("invite", inviteCode);

        if (metadata && metadata.id) {
            let resTxt = `✅ *INFORMASI SALURAN*\n\n` +
                         `📝 *Nama:* ${metadata.name}\n` +
                         `🆔 *ID:* ${metadata.id}\n` +
                         `👥 *Pengikut:* ${metadata.subscribers ? metadata.subscribers.toLocaleString() : 'Tersembunyi'}\n` +
                         `🎭 *Role Bot:* ${metadata.my_role || 'Guest'}\n\n` +
                         `*Gunakan ID di atas untuk keperluan sistem.*`;
            
            sock.sendMessage(from, { text: resTxt }, { quoted: msg });
        } else {
            sock.sendMessage(from, { text: '❌ Metadata tidak ditemukan. Pastikan saluran tersebut publik.' }, { quoted: msg });
        }
    } catch (e) {
        // Jika terjadi error (misal link kadaluarsa atau koneksi)
        sock.sendMessage(from, { text: '❌ Gagal mengambil ID. Link mungkin salah atau saluran tidak ditemukan.' }, { quoted: msg });
    }
    break;
}


case 'jedapush': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
        return;
    }

    if (!args || isNaN(args)) {
        await sock.sendMessage(from, {
            text: '❌ Gunakan: .jedapush 1 (dalam detik)'
        });
        return;
    }

    const detik = Number(args);

    if (detik < 1) {
        await sock.sendMessage(from, { text: '❌ Minimal jeda 1 detik.' });
        return;
    }

    config.push.delay = detik * 1000;

    await sock.sendMessage(from, {
        text: `✅ Jeda push berhasil diatur ke ${detik} detik`
    });
    break;
}
case 'pushkontak': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
        return;
    }

    if (!args.includes('|')) {
        await sock.sendMessage(from, {
            text: '❌ Format salah.\nGunakan: .pushkontak idgrup|teks'
        });
        return;
    }

    const [groupId, textPush] = args.split('|');

    if (!groupId.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '❌ ID grup tidak valid.' });
        return;
    }

    if (!textPush) {
        await sock.sendMessage(from, { text: '❌ Teks tidak boleh kosong.' });
        return;
    }

    let groupMetadata;
    try {
        groupMetadata = await sock.groupMetadata(groupId);
    } catch {
        await sock.sendMessage(from, { text: '❌ Gagal mengambil data grup.' });
        return;
    }

    const members = groupMetadata.participants
        .map(p => p.id)
        .filter(id => id !== sock.user.id);

    if (members.length === 0) {
        await sock.sendMessage(from, { text: '❌ Tidak ada member untuk dikirimi pesan.' });
        return;
    }

    const delay = config.push.delay || 3000;

    await sock.sendMessage(from, {
        text: `📤 Push dimulai\nGrup: ${groupMetadata.subject}\nTotal: ${members.length}\nJeda: ${delay / 1000} detik`
    });

    let success = 0;

    for (const member of members) {
        try {
            await sock.sendMessage(member, { text: textPush });
            success++;
        } catch {}

        await new Promise(res => setTimeout(res, delay));
    }

    await sock.sendMessage(from, {
        text: `✅ Push selesai\nBerhasil: ${success}/${members.length}`
    });
    break;
}
case 'bljpm': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
        return;
    }

    if (!args) {
        await sock.sendMessage(from, {
            text: '❌ Gunakan: .bljpm idgrup'
        });
        return;
    }

    const groupId = args.trim();
    if (!groupId.endsWith('@g.us')) {
        await sock.sendMessage(from, {
            text: '❌ ID grup tidak valid.'
        });
        return;
    }

    const blacklist = await loadBlJpm();
    if (blacklist.includes(groupId)) {
        await sock.sendMessage(from, {
            text: '❌ Grup sudah ada di blacklist JPM.'
        });
        return;
    }

    blacklist.push(groupId);
    await saveBlJpm(blacklist);

    await sock.sendMessage(from, {
        text: `✅ Grup berhasil ditambahkan ke blacklist JPM\nID: ${groupId}`
    });
    break;
}
case 'delbljpm': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
        return;
    }

    if (!args) {
        await sock.sendMessage(from, {
            text: '❌ Gunakan: .delbljpm idgrup'
        });
        return;
    }

    const groupId = args.trim();
    const blacklist = await loadBlJpm();

    if (!blacklist.includes(groupId)) {
        await sock.sendMessage(from, {
            text: '❌ Grup tidak ditemukan di blacklist JPM.'
        });
        return;
    }

    const updated = blacklist.filter(id => id !== groupId);
    await saveBlJpm(updated);

    await sock.sendMessage(from, {
        text: `✅ Grup dihapus dari blacklist JPM\nID: ${groupId}`
    });
    break;
}
case 'listbljpm': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya untuk owner.' });
        return;
    }

    const blacklist = await loadBlJpm();

    if (blacklist.length === 0) {
        await sock.sendMessage(from, {
            text: '📭 Tidak ada grup dalam blacklist JPM.'
        });
        return;
    }

    let text = '📋 Daftar Blacklist JPM:\n\n';
    blacklist.forEach((id, i) => {
        text += `${i + 1}. ${id}\n`;
    });

    await sock.sendMessage(from, { text });
    break;
}
case 'jedajpm': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Owner only.' });
        return;
    }

    if (!args || isNaN(args)) {
        await sock.sendMessage(from, { text: '❌ Contoh: .jedajpm 2' });
        return;
    }

    const detik = Number(args);
    if (detik < 1) {
        await sock.sendMessage(from, { text: '❌ Minimal 1 detik.' });
        return;
    }

    config.jpm.delay = detik * 1000;

    await sock.sendMessage(from, {
        text: `✅ Jeda JPM diset ke ${detik} detik`
    });
    break;
}
case 'jpm': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Owner only.' });
        return;
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    let textJpm = args || '';
    let mediaType = null;
    let mediaMessage = null;

    // ===== MEDIA DARI REPLY =====
    if (quoted) {
        if (quoted.imageMessage) {
            mediaType = 'image';
            mediaMessage = quoted.imageMessage;
            if (!textJpm) textJpm = quoted.imageMessage.caption || '';
        } else if (quoted.videoMessage) {
            mediaType = 'video';
            mediaMessage = quoted.videoMessage;
            if (!textJpm) textJpm = quoted.videoMessage.caption || '';
        } else if (quoted.documentMessage) {
            mediaType = 'document';
            mediaMessage = quoted.documentMessage;
        } else if (quoted.conversation && !textJpm) {
            textJpm = quoted.conversation;
        }
    }

    // ===== MEDIA DARI PESAN LANGSUNG =====
    if (!mediaMessage) {
        if (msg.message?.imageMessage) {
            mediaType = 'image';
            mediaMessage = msg.message.imageMessage;
        } else if (msg.message?.videoMessage) {
            mediaType = 'video';
            mediaMessage = msg.message.videoMessage;
        } else if (msg.message?.documentMessage) {
            mediaType = 'document';
            mediaMessage = msg.message.documentMessage;
        }
    }

    if (!textJpm && !mediaMessage) {
        await sock.sendMessage(from, {
            text: '❌ Kirim teks, media, atau reply pesan.'
        });
        return;
    }

    const blacklist = await loadBlJpm();

    const groups = Object.keys(await sock.groupFetchAllParticipating())
        .filter(id => !blacklist.includes(id));

    if (groups.length === 0) {
        await sock.sendMessage(from, {
            text: '❌ Semua grup masuk blacklist JPM.'
        });
        return;
    }

    const delay = config.jpm.delay || 3000;

    await sock.sendMessage(from, {
        text: `📢 JPM dimulai\nTotal grup: ${groups.length}\nJeda: ${delay / 1000} detik`
    });

    let sukses = 0;

    for (const groupId of groups) {
        try {
            if (mediaMessage) {
                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                let buffer = Buffer.from([]);

                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                await sock.sendMessage(groupId, {
                    [mediaType]: buffer,
                    caption: textJpm || undefined
                });
            } else {
                await sock.sendMessage(groupId, { text: textJpm });
            }

            sukses++;
        } catch {}

        await new Promise(res => setTimeout(res, delay));
    }

    await sock.sendMessage(from, {
        text: `✅ JPM selesai\nBerhasil: ${sukses}/${groups.length}`
    });
    break;
}
case 'payment': {
    const pay = config.payment;

    if (!pay) {
        await sock.sendMessage(from, { text: '❌ Data payment belum diatur.' });
        return;
    }

    const text =
`⚊ List Metode Pembayaran ⚊

Dana  : ${pay.dana}
Gopay : ${pay.gopay}

Scan QRIS untuk metode pembayaran lainnya.
Terima kasih 🙏`;

    try {
        if (pay.qris) {
            await sock.sendMessage(from, {
                image: { url: pay.qris },
                caption: text
            });
        } else {
            await sock.sendMessage(from, { text });
        }
    } catch (err) {
        await sock.sendMessage(from, {
            text: '❌ Gagal menampilkan payment.'
        });
    }
    break;
}
case 'autopromo': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Owner only.' });
        return;
    }

    const promo = await loadAutoPromo();

    if (args === 'on') {
        promo.status = true;
        await saveAutoPromo(promo);
        await sock.sendMessage(from, { text: '✅ AutoPromo diaktifkan.' });
    } else if (args === 'off') {
        promo.status = false;
        await saveAutoPromo(promo);
        await sock.sendMessage(from, { text: '❌ AutoPromo dimatikan.' });
    } else {
        await sock.sendMessage(from, {
            text: 'Gunakan:\n.autopromo on\n.autopromo off'
        });
    }
    break;
}
case 'setpromo': {
    if (!isOwner) {
        await sock.sendMessage(from, { text: '❌ Owner only.' });
        return;
    }

    if (!args.includes('|')) {
        await sock.sendMessage(from, {
            text: '❌ Format salah\nContoh:\n.setpromo Promo kami|1'
        });
        return;
    }

    const [text, delay] = args.split('|').map(v => v.trim());

    if (!text || isNaN(delay) || Number(delay) < 1) {
        await sock.sendMessage(from, {
            text: '❌ Jeda harus angka (menit) & teks tidak boleh kosong.'
        });
        return;
    }

    const promo = await loadAutoPromo();
    promo.text = text;
    promo.delay = Number(delay);
    promo.lastReply = {}; // reset cooldown
    await saveAutoPromo(promo);

    await sock.sendMessage(from, {
        text: `✅ Promo disimpan\nJeda: ${delay} menit`
    });
    break;
}
case 'ttsearch': {
    if (!args) {
        await sock.sendMessage(from, {
            text: '❌ Gunakan:\n.ttsearch kata kunci'
        });
        return;
    }

    const query = encodeURIComponent(args);
    const apiUrl = `https://fyxzpedia-apikey.vercel.app/search/tiktok?apikey=Fyxz&q=${query}`;

    await sock.sendMessage(from, { text: '🔍 Mencari video TikTok...' });

    try {
        const res = await fetch(apiUrl);
        const json = await res.json();

        if (!json.status || !json.result || json.result.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ Video tidak ditemukan.'
            });
            return;
        }

        const results = json.result.slice(0, 5); // batasi 5 hasil

        let text = `Hasil pencarian TikTok\nKata kunci: ${args}\n\n`;

        results.forEach((v, i) => {
            text +=
`${i + 1}. ${v.title || '-'}
Author : ${v.author?.nickname || '-'}
Durasi : ${v.duration}s
Views  : ${v.play_count}
Link   : ${v.play}

`;
        });

        text += 'Gunakan link di atas untuk menonton / download.';

        await sock.sendMessage(from, { text });

    } catch (err) {
        console.error('TTSEARCH ERROR:', err);
        await sock.sendMessage(from, {
            text: '❌ Terjadi kesalahan saat mengambil data TikTok.'
        });
    }
    break;
}
        case 'bratvid': {
            if (!args) {
                return await sock.sendMessage(from, { text: '❌ Masukkan teks!\nContoh: .bratvid Halo' });
            }

            try {
                // 1. Ambil data dari API
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/imagecreator/bratvid?apikey=Fyxz&text=${encodeURIComponent(args)}`;
                const response = await fetch(apiUrl);
                
                if (!response.ok) throw new Error('API Error');

                // 2. Cara yang benar mengambil buffer di Node.js modern
                const arrayBuffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);

                // 3. Buat sticker (Pastikan nama class Sticker sesuai dengan import Anda)
                // Di kode sebelumnya Anda menggunakan 'new Sticker' (huruf S besar)
                const stickerData = new Sticker(imageBuffer, {
                    pack: config.bot.name,
                    author: 'Fyxzpedia',
                    type: StickerTypes.FULL,
                    quality: 100
                });
                
                await sock.sendMessage(from, await stickerData.toMessage());
                
            } catch (error) {
                console.error('Bratvid Error:', error);
                await sock.sendMessage(from, { text: '❌ Gagal membuat sticker. API mungkin sedang down.' });
            }
            break;
        }
        // ==================== FITUR PRODUK ====================
        case 'addproduk': {
            if (!isOwner) return await sock.sendMessage(from, { text: '❌ Hanya Owner yang dapat menambah produk.' });
            if (!args.includes('|')) return await sock.sendMessage(from, { text: '❌ Format salah!\nContoh: *.addproduk Nama | Harga | Deskripsi*' });

            const [nama, harga, deskripsi] = args.split('|').map(v => v.trim());
            if (!nama || !harga) return await sock.sendMessage(from, { text: '❌ Nama dan Harga tidak boleh kosong.' });

            const db = await getDb();
            const idProduk = 'PRD-' + Math.floor(1000 + Math.random() * 9000);

            db.produk.push({
                id: idProduk,
                nama,
                harga,
                deskripsi: deskripsi || 'Tidak ada deskripsi.'
            });

            await saveDb(db);
            await sock.sendMessage(from, { 
                text: `✅ *Produk Berhasil Disimpan*\n\n🆔 ID: \`${idProduk}\`\n📦 Nama: ${nama}\n💰 Harga: ${harga}\n📝 Desk: ${deskripsi}` 
            });
            break;
        }

        case 'listproduk': {
            const db = await getDb();
            if (!db.produk || db.produk.length === 0) {
                return await sock.sendMessage(from, { text: '📦 Belum ada produk yang tersedia.' });
            }

            let list = `✨ *KATALOG PRODUK ${config.bot.name.toUpperCase()}* ✨\n\n`;
            db.produk.forEach((p, i) => {
                list += `*${i + 1}. ${p.nama}*\n💰 Harga: ${p.harga}\n\n`;
            });
            list += `_Ketik *.nomor* (contoh: *.1*) untuk melihat detail deskripsi dan ID produk._`;

            await sock.sendMessage(from, { text: list });
            break;
        }

        case 'delproduk': {
            if (!isOwner) return await sock.sendMessage(from, { text: '❌ Hanya Owner yang dapat menghapus produk.' });
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan ID Produk!\nContoh: *.delproduk PRD-1234*' });

            const db = await getDb();
            const initialLength = db.produk.length;
            
            db.produk = db.produk.filter(p => p.id !== args.trim());

            if (db.produk.length === initialLength) {
                return await sock.sendMessage(from, { text: '❌ ID Produk tidak ditemukan. Cek kembali di detail produk.' });
            }

            await saveDb(db);
            await sock.sendMessage(from, { text: `✅ Produk dengan ID *${args}* berhasil dihapus.` });
            break;
        }

        // Fitur Detail Produk Otomatis (.1, .2, dst)
        case (command.match(/^\d+$/) || {}).input: {
            const db = await getDb();
            const index = parseInt(command) - 1;

            if (db.produk && db.produk[index]) {
                const p = db.produk[index];
                const detail = `📄 *DETAIL PRODUK* 📄\n\n` +
                    `📦 *Nama:* ${p.nama}\n` +
                    `💰 *Harga:* ${p.harga}\n` +
                    `🆔 *ID Produk:* \`${p.id}\`\n\n` +
                    `📝 *Deskripsi:*\n${p.deskripsi}\n\n` +
                    `_Ingin memesan? Silakan hubungi admin._`;
                
                await sock.sendMessage(from, { text: detail });
            }
            break;
        }

                case 'brat': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan teks!\nContoh: .brat Halo Dunia' });

            try {
                // 1. URL API Brat
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/imagecreator/bratv?apikey=Fyxz&text=${encodeURIComponent(args)}`;
                
                // 2. Ambil data gambar dari API
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error('API Error atau API Key salah');

                const arrayBuffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);

                // 3. Konversi Buffer gambar menjadi Sticker
                // Menggunakan class Sticker yang sudah Anda import di awal case.js
                const stickerData = new Sticker(imageBuffer, {
                    pack: config.bot.name, // Nama pack dari config
                    author: 'Fyxzpedia',   // Nama author
                    type: StickerTypes.FULL,
                    quality: 100
                });

                // 4. Kirim sebagai sticker
                await sock.sendMessage(from, await stickerData.toMessage());

            } catch (error) {
                console.error('Error Brat Sticker:', error);
                await sock.sendMessage(from, { text: '❌ Gagal membuat sticker brat. Pastikan API aktif.' });
            }
            break;
        }
        
        case 'tiktok':
        case 'tt': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan URL TikTok!\nContoh: .tiktok https://vt.tiktok.com/xxxx/' });
            
            await sock.sendMessage(from, { text: '⏳ Sedang memproses video, mohon tunggu...' });

            try {
                // 1. Panggil API v2 Anda
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/download/tiktok-v2?apikey=Fyxz&url=${encodeURIComponent(args)}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                // 2. Validasi respon API
                if (!json.status || !json.result || !json.result.data) {
                    return await sock.sendMessage(from, { text: '❌ Gagal mengambil data. Pastikan link TikTok valid.' });
                }

                const res = json.result.data;
                
                // 3. Susun Caption Informasi
                let caption = `🎬 *TIKTOK DOWNLOADER*\n\n`;
                caption += `📝 *Judul:* ${res.title || 'Tidak ada judul'}\n`;
                caption += `👤 *Author:* ${res.author.nickname} (@${res.author.unique_id})\n`;
                caption += `⏱️ *Durasi:* ${res.duration} detik\n\n`;
                caption += `📊 *Statistik:*\n`;
                caption += `❤️ Like: ${res.digg_count.toLocaleString()}\n`;
                caption += `💬 Komentar: ${res.comment_count.toLocaleString()}\n`;
                caption += `🔁 Share: ${res.share_count.toLocaleString()}\n\n`;
                caption += `✨ *${config.bot.name}*`;

                // 4. Kirim Video (Menggunakan hdplay untuk kualitas terbaik tanpa watermark)
                await sock.sendMessage(from, { 
                    video: { url: res.hdplay || res.play }, 
                    caption: caption 
                }, { quoted: msg });

            } catch (error) {
                console.error('Tiktok Error:', error);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan pada server API.' });
            }
            break;
        }
                case 'ig':
        case 'igdownload':
        case 'instagram': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan URL Instagram!\nContoh: .igdownload https://www.instagram.com/reel/xxxxx/' });
            
            await sock.sendMessage(from, { text: '⏳ Sedang mengunduh media Instagram, mohon tunggu...' });

            try {
                // 1. Panggil API Instagram Anda
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/download/instagram?apikey=Fyxz&url=${encodeURIComponent(args)}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                // 2. Validasi respon API
                if (!json.status || !json.result || json.result.length === 0) {
                    return await sock.sendMessage(from, { text: '❌ Gagal mengambil data. Pastikan link Instagram valid dan tidak di-private.' });
                }

                // 3. Ambil data pertama dari array result
                const data = json.result[0];
                const downloadUrl = data.url_download;
                const isVideo = downloadUrl.includes('.mp4') || data.kualitas.toLowerCase().includes('video');

                // 4. Kirim Media
                if (isVideo) {
                    await sock.sendMessage(from, { 
                        video: { url: downloadUrl }, 
                        caption: `✅ *Instagram Downloader*\n\n✨ Powered by ${json.creator}`,
                        fileName: data.filename
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { 
                        image: { url: downloadUrl }, 
                        caption: `✅ *Instagram Downloader*\n\n✨ Powered by ${json.creator}`
                    }, { quoted: msg });
                }

            } catch (error) {
                console.error('Instagram Download Error:', error);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses link Instagram.' });
            }
            break;
        }
                case 'emojimix':
        case 'mix': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan dua emoji dengan pemisah + \nContoh: *.emojimix 😭+🥰*' });

            // Memisahkan dua emoji berdasarkan tanda '+'
            const [emo1, emo2] = args.split('+').map(e => e.trim());
            
            if (!emo1 || !emo2) return await sock.sendMessage(from, { text: '❌ Format salah! Gunakan pemisah +\nContoh: *.emojimix 😭+🥰*' });

            try {
                await sock.sendMessage(from, { text: '⏳ Sedang menggabungkan emoji...' });

                // 1. URL API Emojimix
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/tools/emojimix?apikey=Fyxz&emoji1=${encodeURIComponent(emo1)}&emoji2=${encodeURIComponent(emo2)}`;
                
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error('API Error atau emoji tidak didukung');

                // 2. Ambil Buffer gambar
                const arrayBuffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);

                // 3. Konversi ke Sticker
                const stickerData = new Sticker(imageBuffer, {
                    pack: config.bot.name,
                    author: 'Emojimix',
                    type: StickerTypes.FULL,
                    quality: 100
                });

                // 4. Kirim Sticker
                await sock.sendMessage(from, await stickerData.toMessage());

            } catch (error) {
                console.error('Emojimix Error:', error);
                await sock.sendMessage(from, { text: '❌ Gagal menggabungkan emoji. Pastikan kedua emoji valid dan didukung oleh Google/API.' });
            }
            break;
        }
                case 'ss':
        case 'ssweb': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan URL website yang ingin di-screenshot!\nContoh: *.ssweb https://google.com*' });

            // Pastikan input memiliki http:// atau https://
            let url = args.trim();
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }

            await sock.sendMessage(from, { text: '⏳ Sedang mengambil screenshot website, mohon tunggu...' });

            try {
                // 1. Panggil API Screenshot Website Anda
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/tools/ssweb?apikey=Fyxz&url=${encodeURIComponent(url)}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                // 2. Validasi respon API
                if (!json.status || !json.result) {
                    return await sock.sendMessage(from, { text: '❌ Gagal mengambil screenshot. Pastikan URL valid.' });
                }

                // 3. Kirim hasil gambar
                await sock.sendMessage(from, { 
                    image: { url: json.result }, 
                    caption: `✅ *Screenshot Website*\n\n🌐 *URL:* ${url}\n✨ Powered by ${json.creator}`
                }, { quoted: msg });

            } catch (error) {
                console.error('SSWeb Error:', error);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat menghubungi server API.' });
            }
            break;
        }
        case 'suarateks': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan teks yang ingin diubah menjadi suara!\nContoh: *.suarateks Halo, ini audio eksternal*' });

            try {
                // 1. Ambil link audio dari API JSON
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/tools/text-to-speech?apikey=Fyxz&text=${encodeURIComponent(args)}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                if (!json.status || !json.result || json.result.length === 0) {
                    return await sock.sendMessage(from, { text: '❌ Gagal menghasilkan suara.' });
                }

                const audioUrl = json.result[0].url;

                // 2. Download file audio (.wav) tersebut menjadi Buffer
                const audioRes = await fetch(audioUrl);
                const arrayBuffer = await audioRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // 3. Kirim sebagai Audio Eksternal (ptt: false)
                await sock.sendMessage(from, { 
                    audio: buffer, 
                    mimetype: 'audio/mpeg', // Mime type standar audio
                    ptt: false, // Mengirim sebagai file audio biasa, bukan voice note
                    fileName: `suara_${Date.now()}.mp3` // Nama file agar terlihat rapi
                }, { quoted: msg });

            } catch (error) {
                console.error('TTS Error:', error);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses audio.' });
            }
            break;
        }
        case 'gimage':
        case 'image':
        case 'googleimage': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan kata kunci pencarian!\nContoh: *.gimage mobil balap*' });

            await sock.sendMessage(from, { text: `⏳ Mencari 5 gambar untuk: *${args}*...` });

            try {
                // 1. Panggil API Google Image Search Anda
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/search/gimage?apikey=Fyxz&q=${encodeURIComponent(args)}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                // 2. Validasi respon API
                if (!json.status || !json.result || !json.result.images || json.result.images.length === 0) {
                    return await sock.sendMessage(from, { text: '❌ Gambar tidak ditemukan.' });
                }

                // 3. Ambil hanya 5 gambar pertama
                const imagesToSend = json.result.images.slice(0, 5);

                // 4. Perulangan untuk mengirim gambar
                for (let img of imagesToSend) {
                    // Validasi jika imageUrl hanya berisi karakter tunggal (seperti contoh respon Anda)
                    if (img.imageUrl.length > 5) {
                        await sock.sendMessage(from, { 
                            image: { url: img.imageUrl }, 
                            caption: `🔎 Hasil pencarian: ${args}`
                        });
                    }
                }

            } catch (error) {
                console.error('GImage Error:', error);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mencari gambar.' });
            }
            break;
        }
                case 'pin':
        case 'pinterest': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan kata kunci pencarian!\nContoh: *.pinterest epep burik*' });

            await sock.sendMessage(from, { text: `⏳ Mencari 5 gambar Pinterest untuk: *${args}*...` });

            try {
                // 1. Panggil API Pinterest Anda
                const apiUrl = `https://fyxzpedia-apikey.vercel.app/search/pinterest?apikey=Fyxz&q=${encodeURIComponent(args)}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                // 2. Validasi respon API (result berupa array link gambar)
                if (!json.status || !json.result || json.result.length === 0) {
                    return await sock.sendMessage(from, { text: '❌ Gambar tidak ditemukan di Pinterest.' });
                }

                // 3. Ambil hanya 5 link pertama dari array result
                const imagesToSend = json.result.slice(0, 5);

                // 4. Perulangan untuk mengirim 5 gambar
                for (let imageUrl of imagesToSend) {
                    await sock.sendMessage(from, { 
                        image: { url: imageUrl }, 
                        caption: `📌 Pinterest: ${args}`
                    });
                }

            } catch (error) {
                console.error('Pinterest Error:', error);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mencari gambar di Pinterest.' });
            }
            break;
        }
        
        case 'ffstalk': {
            if (!args) return await sock.sendMessage(from, { text: '❌ Masukkan ID Free Fire!\nContoh: *.ffstalk 1295104948*' });

            try {
                // 1. Panggil API Stalk FF
                const response = await fetch(`https://fyxzpedia-apikey.vercel.app/stalk/ff?apikey=Fyxz&id=${args}`);
                const json = await response.json();

                // 2. Validasi Respon
                if (!json.status || !json.result) {
                    return await sock.sendMessage(from, { text: '❌ ID Free Fire tidak ditemukan.' });
                }

                const res = json.result;
                const stalkText = `🎮 *FREE FIRE STALKER*\n\n` +
                    `👤 *Nickname:* ${res.nickname}\n` +
                    `🆔 *ID:* ${args}\n` +
                    `🌍 *Region:* ${res.region}\n` +
                    `🔐 *Open ID:* ${res.open_id}\n\n` +
                    `✨ Powered by ${json.creator}`;

                // 3. Kirim Teks Saja dengan Fake Quote minimalis
                await sock.sendMessage(from, { 
                    text: stalkText,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363402625644245@newsletter',
                            newsletterName: '© Fyxzpedia',
                            serverMessageId: -1
                        }
                    }
                }, { quoted: msg });

            } catch (error) {
                console.error('FFStalk Error:', error);
                await sock.sendMessage(from, { text: '❌ Gagal mendapatkan data.' });
            }
            break;
        }
        
case 'removebg':
case 'rbg': {
    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
    const axios = require('axios');
    const FormData = require('form-data');

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isQuotedImage = quoted?.imageMessage;
    const isDirectImage = msg.message?.imageMessage;

    if (!isDirectImage && !isQuotedImage) return await sock.sendMessage(from, { text: '❌ Balas atau kirim foto dengan caption *.removebg*' });

    const messageToDownload = isDirectImage ? msg : { 
        key: msg.message.extendedTextMessage.contextInfo.stanzaId, 
        message: quoted 
    };

    await sock.sendMessage(from, { text: '⏳ Sedang memproses... (Free Server)' });

    try {
        const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

        // Upload ke Catbox (karena API gratis biasanya butuh link URL)
        const form = new FormData();
        form.append('fileToUpload', buffer, { filename: 'rbg.jpg' });
        form.append('reqtype', 'fileupload');
        const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders() });
        const imageUrl = uploadRes.data;

        // MENGGUNAKAN API PROVIDER YANG STABIL (Contoh: Aovictor atau sejenisnya)
        const res = await axios.get(`https://api.aovictor.com/removebg?url=${encodeURIComponent(imageUrl)}`);
        const resultUrl = res.data.url || res.data.result;

        if (!resultUrl) throw new Error("Gagal mendapatkan hasil.");

        await sock.sendMessage(from, { 
            image: { url: resultUrl }, 
            caption: '✅ Background berhasil dihapus!'
        }, { quoted: msg });

    } catch (err) {
        await sock.sendMessage(from, { text: "❌ Maaf, server sedang sibuk. Coba lagi beberapa saat lagi." });
    }
    break;
}



        case 'tourlv1': 
        case 'tourlv2': 
        case 'tourlv3': 
        {
            const { downloadMediaMessage } = require("@whiskeysockets/baileys");
            const axios = require('axios');
            const FormData = require('form-data');

            // Cek apakah ada media (foto/video)
            const isMedia = msg.message?.imageMessage || 
                            msg.message?.videoMessage || 
                            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage || 
                            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

            if (!isMedia) return await sock.sendMessage(from, { text: '❌ Balas atau kirim media (Foto/Video) dengan perintah *.tourlv1/v2/v3*' });

            await sock.sendMessage(from, { text: '⏳ Sedang memproses media...' });

            try {
                // 1. Download media menjadi buffer
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { 
                    reuploadRequest: sock.updateMediaMessage 
                });

                let resultUrl = '';
                let provider = '';

                // 2. Logika Upload berdasarkan Command
                if (command === 'tourlv1') {
                    provider = 'Catbox.moe';
                    const form = new FormData();
                    form.append('fileToUpload', buffer, { filename: 'file.jpg' });
                    form.append('reqtype', 'fileupload');
                    const res = await axios.post('https://catbox.moe/user/api.php', form, {
                        headers: form.getHeaders()
                    });
                    resultUrl = res.data;
                } 
                else if (command === 'tourlv2') {
                    provider = 'Telegra.ph';
                    const form = new FormData();
                    form.append('file', buffer, { filename: 'file.jpg' });
                    const res = await axios.post('https://telegra.ph/upload', form, {
                        headers: form.getHeaders()
                    });
                    resultUrl = 'https://telegra.ph' + res.data[0].src;
                }
                else if (command === 'tourlv3') {
                    provider = 'File.io';
                    const form = new FormData();
                    form.append('file', buffer, { filename: 'file.jpg' });
                    const res = await axios.post('https://file.io', form, {
                        headers: form.getHeaders()
                    });
                    resultUrl = res.data.link;
                }

                // 3. Kirim Hasil
                await sock.sendMessage(from, {
                    text: `✅ *UPLOAD SUCCESS*\n\n🌐 *Provider:* ${provider}\n🔗 *URL:* ${resultUrl}\n\n*© Fyxzpedia Developer*`,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363402625644245@newsletter',
                            newsletterName: '© Fyxzpedia Developer',
                            serverMessageId: -1
                        },
                        externalAdReply: {
                            title: `Uploader ${provider}`,
                            body: 'Klik link untuk melihat media',
                            thumbnailUrl: 'https://files.catbox.moe/0s9yn1.jpg',
                            sourceUrl: resultUrl,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg });

            } catch (err) {
                console.error(err);
                await sock.sendMessage(from, { text: `❌ Gagal mengunggah: ${err.message}` });
            }
            break;
        }
// ==================== PTERODACTYL ULTIMATE ENGINE FINAL ====================

case 'cadmin':
case '1gb': case '2gb': case '3gb': case '4gb': case '5gb': 
case '6gb': case '7gb': case '8gb': case '9gb': case '10gb': 
case 'unli': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' }, { quoted: msg });
    if (!text) return sock.sendMessage(from, { text: `Format: .${command} nama,628xxx` }, { quoted: msg });

    let [nama, target] = text.split(',');
    let username = nama.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (username.length < 3) return sock.sendMessage(from, { text: '❌ Nama minimal 3 karakter!' });

    let password = username + Math.floor(1000 + Math.random() * 9000);
    let email = username + "@gmail.com";

    const ramMap = { 
        '1gb': 1024, '2gb': 2048, '3gb': 3072, '4gb': 4096, '5gb': 5120, 
        '6gb': 6144, '7gb': 7168, '8gb': 8192, '9gb': 9216, '10gb': 10240, 'unli': 0 
    };
    
    const isCadmin = command === 'cadmin';
    const ram = isCadmin ? 0 : (ramMap[command] || 1024);

    await sock.sendMessage(from, { text: `⏳ Memproses ${command.toUpperCase()}...` }, { quoted: msg });

    try {
        const ptero = config.pterodactyl;
        const headers = {
            "Authorization": `Bearer ${ptero.plta}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        };

        // STEP 1: CREATE USER
        const userRes = await axios.post(`${ptero.host}/api/application/users`, {
            username: username,
            email: email,
            first_name: username,
            last_name: isCadmin ? "Admin" : "User",
            root_admin: isCadmin,
            password: password
        }, { headers });

        const userId = userRes.data.attributes.id;

        // STEP 2: CREATE SERVER (Hanya jika bukan cadmin)
        if (!isCadmin) {
            try {
                await axios.post(`${ptero.host}/api/application/servers`, {
                    name: username + " Server",
                    user: userId,
                    egg: parseInt(ptero.egg),
                    docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
                    startup: "node index.js",
                    limits: { memory: ram, swap: 0, disk: 10240, io: 500, cpu: ram === 0 ? 0 : 100 },
                    feature_limits: { databases: 5, backups: 5, allocations: 1 },
                    deploy: { locations: [parseInt(ptero.location)], dedicated_ip: false, port_range: [] },
                    environment: { INST_USER: "container", USER_UPLOAD: "0", AUTO_UPDATE: "0", CMD_RUN: "node index.js" }
                }, { headers });
            } catch (serverErr) {
                // Jika user berhasil tapi server gagal (Ini sering 404 jika ID EGG/LOC salah)
                let detail = serverErr.response?.data?.errors ? serverErr.response.data.errors[0].detail : serverErr.message;
                return sock.sendMessage(from, { text: `⚠️ Akun User Berhasil (ID: ${userId}), tetapi Gagal membuat Server.\n\nError: ${detail}\nSaran: Cek ID EGG & LOCATION di config.js` }, { quoted: msg });
            }
        }

        let resTxt = `✅ *SUKSES CREATE ${command.toUpperCase()}*\n\n` +
                     `👤 User: ${username}\n` +
                     `🔑 Pass: ${password}\n` +
                     `🆔 ID User: ${userId}\n` +
                     `🌐 Host: ${ptero.host}`;

        if (target) {
            let targetJid = target.trim().replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.sendMessage(targetJid, { text: resTxt });
            sock.sendMessage(from, { text: `✅ Berhasil! Data dikirim ke pembeli.` }, { quoted: msg });
        } else {
            sock.sendMessage(from, { text: resTxt }, { quoted: msg });
        }

    } catch (e) {
        let detail = e.response?.data?.errors ? e.response.data.errors[0].detail : e.message;
        sock.sendMessage(from, { text: `❌ Gagal: ${detail}` }, { quoted: msg });
    }
    break;
}

case 'listpanel': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' }, { quoted: msg });
    try {
        const h = { "Authorization": `Bearer ${config.pterodactyl.plta}`, "Accept": "application/json" };
        const [uRes, sRes] = await Promise.all([
            axios.get(`${config.pterodactyl.host}/api/application/users`, { headers: h }),
            axios.get(`${config.pterodactyl.host}/api/application/servers`, { headers: h })
        ]);

        let txt = `📋 *PANEL MONITORING*\n\n*USER LIST:*\n`;
        txt += uRes.data.data.map(v => `- [${v.attributes.id}] ${v.attributes.username}`).join('\n') || 'Kosong';
        txt += `\n\n*SERVER LIST:*\n`;
        txt += sRes.data.data.map(v => `- [${v.attributes.id}] ${v.attributes.name} (Owner: ${v.attributes.user})`).join('\n') || 'Kosong';
        
        sock.sendMessage(from, { text: txt }, { quoted: msg });
    } catch (e) { sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }); }
    break;
}

case 'delpanel': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' }, { quoted: msg });
    if (!text) return sock.sendMessage(from, { text: 'Masukkan ID User!' });
    const userId = text.trim();
    if (userId === "1") return sock.sendMessage(from, { text: '❌ Proteksi Admin Utama!' });

    try {
        const h = { "Authorization": `Bearer ${config.pterodactyl.plta}`, "Accept": "application/json" };
        const sRes = await axios.get(`${config.pterodactyl.host}/api/application/servers`, { headers: h });
        const targets = sRes.data.data.filter(v => String(v.attributes.user) === userId);

        for (let s of targets) {
            await axios.delete(`${config.pterodactyl.host}/api/application/servers/${s.attributes.id}/force`, { headers: h });
        }
        await new Promise(r => setTimeout(r, 1500));
        await axios.delete(`${config.pterodactyl.host}/api/application/users/${userId}`, { headers: h });

        sock.sendMessage(from, { text: `✅ Berhasil menghapus User ID ${userId} & ${targets.length} Server.` });
    } catch (e) { sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }); }
    break;
}

case 'delserver': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' });
    if (!text) return sock.sendMessage(from, { text: 'Masukkan ID Server!' });
    try {
        await axios.delete(`${config.pterodactyl.host}/api/application/servers/${text.trim()}/force`, { 
            headers: { "Authorization": `Bearer ${config.pterodactyl.plta}`, "Accept": "application/json" } 
        });
        sock.sendMessage(from, { text: `✅ Server ID ${text.trim()} dihapus.` });
    } catch (e) { sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }); }
    break;
}

case 'deluser': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' });
    if (!text) return sock.sendMessage(from, { text: 'Masukkan ID User!' });
    try {
        await axios.delete(`${config.pterodactyl.host}/api/application/users/${text.trim()}`, { 
            headers: { "Authorization": `Bearer ${config.pterodactyl.plta}`, "Accept": "application/json" } 
        });
        sock.sendMessage(from, { text: `✅ User ID ${text.trim()} dihapus.` });
    } catch (e) { sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }); }
    break;
}

case 'clearserver': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' });
    await sock.sendMessage(from, { text: '⏳ Membersihkan semua server...' });
    try {
        const h = { "Authorization": `Bearer ${config.pterodactyl.plta}`, "Accept": "application/json" };
        const res = await axios.get(`${config.pterodactyl.host}/api/application/servers`, { headers: h });
        let count = 0;
        for (let s of res.data.data) {
            if (s.attributes.user !== 1) { // Jangan hapus server milik admin utama
                await axios.delete(`${config.pterodactyl.host}/api/application/servers/${s.attributes.id}/force`, { headers: h });
                count++;
            }
        }
        sock.sendMessage(from, { text: `✅ Berhasil menghapus ${count} server.` });
    } catch (e) { sock.sendMessage(from, { text: '❌ Gagal.' }); }
    break;
}

case 'clearuser': {
    if (!isOwner) return sock.sendMessage(from, { text: '❌ Khusus Owner!' });
    await sock.sendMessage(from, { text: '⏳ Membersihkan semua user...' });
    try {
        const h = { "Authorization": `Bearer ${config.pterodactyl.plta}`, "Accept": "application/json" };
        const res = await axios.get(`${config.pterodactyl.host}/api/application/users`, { headers: h });
        let count = 0;
        for (let u of res.data.data) {
            if (u.attributes.id !== 1) { // Jangan hapus admin utama
                await axios.delete(`${config.pterodactyl.host}/api/application/users/${u.attributes.id}`, { headers: h });
                count++;
            }
        }
        sock.sendMessage(from, { text: `✅ Berhasil menghapus ${count} user.` });
    } catch (e) { sock.sendMessage(from, { text: '❌ Gagal.' }); }
    break;
}


        
        default: {
            if (isOwner) {
                await sock.sendMessage(from, { text: `❓ Command "${command}" tidak dikenali.` });
            }
        }
    }
}