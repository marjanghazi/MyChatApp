#!/usr/bin/env python3
"""Build the styled, source-based QUANTX project handbook at repository root."""

from __future__ import annotations

import re
import subprocess
import tempfile
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "PROJECT_DATA_FLOW.md"
SCHEMA = ROOT / "py_backend" / "app" / "schema.sql"
OUTPUT = ROOT / "QUANTX_Project_Handbook.docx"

NAVY = "10182E"
INK = "17233B"
CYAN = "007FA3"
PURPLE = "5940A8"
PALE = "EAF7FB"
PALE_PURPLE = "F1EDFA"
LIGHT = "F5F7FB"
MUTED = "526178"
WHITE = "FFFFFF"
LINE = "DCE3ED"


TABLE_INTROS = {
    "users": "One row per registered person. This is the account and profile record, not the user's address book on another account.",
    "auth_events": "A small audit trail of successful registration, login, or admin login events. It does not save submitted passwords.",
    "crypto_demo_sessions": "A time window telling the backend which user the admin is temporarily watching for the live demonstration.",
    "crypto_demo_events": "Stage names reported by a participating browser during that window. They describe progress, not secret key material.",
    "groups": "A group definition with member and admin ID arrays. The actual group posts live in messages.",
    "channels": "A channel definition with follower IDs. Channel posts also live in messages.",
    "conversations": "One direct-chat summary row for a pair of users. The full messages are kept separately.",
    "messages": "One stored message row. The JSONB body holds an encrypted direct envelope or ordinary group/channel content.",
    "call_logs": "A call-history record associated with a direct conversation. Details are inside JSONB data.",
    "signals": "Short-lived signaling mail for WebRTC calls, such as an offer, answer, candidate, or hangup.",
    "user_devices": "Older E2EE design table retained in the schema. The current PQC routes do not read or write it.",
    "one_time_prekeys": "Older E2EE design table retained in the schema. The current PQC routes do not use it.",
    "e2ee_sessions": "Older E2EE session table containing historical key/chain fields. Current direct messages do not use it.",
    "e2ee_replay_index": "Older counter-based replay table retained for compatibility. Current protocol v2 uses message UUID receipts instead.",
    "crypto_public_identities": "The current signed public PQC identity bundle for a user and suite. Private identity keys are absent.",
    "crypto_message_receipts": "A permanent record of accepted protocol message IDs so an old ID cannot be reused after an edit or deletion.",
}


FIELD_MEANINGS = {
    "users": {
        "uid": "Application account ID; connects this person to messages and other records.",
        "email": "Email used to sign in. Case-insensitive uniqueness is enforced by an extra index.",
        "password_hash": "Argon2id result. This is not the original password.",
        "display_name": "Name shown in the chat interface.",
        "photo_url": "Location of the profile image.",
        "logo_url": "Location of the optional brand/logo image.",
        "phone_number": "This account's own normalized phone number; nonempty values are unique.",
        "phone_lookup_keys": "Alternative normalized forms of this account's number for contact lookup.",
        "contacts": "Phone numbers saved by this account as contacts; not proof of ownership.",
        "is_online": "Last explicit online/offline flag from the browser.",
        "last_seen": "Last time the presence route was called.",
        "active_at": "Most recent presence heartbeat used for the online indicator.",
        "created_at": "When the account row was created.",
        "updated_at": "When profile/account fields were last changed.",
    },
    "auth_events": {
        "id": "Unique audit-event ID.",
        "account_id": "User ID or admin email associated with the event.",
        "event_type": "Allowed values: register, login, admin_login.",
        "created_at": "Event time.",
    },
    "crypto_demo_sessions": {
        "user_id": "User selected for admin's live demonstration.",
        "started_at": "When the current capture started.",
        "active_until": "Capture deadline; browser steps are accepted only before it.",
    },
    "crypto_demo_events": {
        "id": "Monotonic database event ID.",
        "user_id": "User whose browser reported the stage.",
        "flow_id": "Groups multiple stages into one login/send/receive/file activity.",
        "kind": "Activity type: login, send, receive, or attachment.",
        "step": "Named step such as kem, dsa, kdf, aes, relay, or bundle.",
        "status": "Stage state such as start, active, done, complete, or error.",
        "detail": "Limited extra label, for example generated or reused keys.",
        "sequence": "Order of stages within one flow.",
        "created_at": "When the backend accepted the stage.",
    },
    "groups": {
        "id": "Unique group ID, used as the group message thread ID.",
        "name": "Group title.",
        "description": "Group description.",
        "photo_url": "Group image location.",
        "member_ids": "Array of account IDs considered members.",
        "admins": "Array of account IDs allowed to manage members/admins in route logic.",
        "created_by": "Account ID of the group creator.",
        "created_at": "Creation time.",
        "updated_at": "Last group-row change time.",
        "last_message": "Reserved summary text for a recent group message; current send route does not update it.",
        "last_message_at": "Reserved recent-message time; current send route does not update it.",
    },
    "channels": {
        "id": "Unique channel ID, used as the channel message thread ID.",
        "name": "Channel title.",
        "description": "Channel description.",
        "owner_id": "Account ID supplied when the channel is created.",
        "follower_ids": "Account IDs currently following the channel.",
        "created_at": "Creation time.",
        "updated_at": "Last channel-row change time.",
        "last_post": "Reserved recent-post summary; current send route does not update it.",
        "last_post_at": "Reserved recent-post time; current send route does not update it.",
    },
    "conversations": {
        "id": "Stable direct-chat ID: the two account IDs sorted and joined by an underscore.",
        "participants": "The two account IDs in the direct conversation.",
        "participant_phones": "Snapshot of the participants' phone numbers supplied at first insert.",
        "last_message": "Sidebar preview placeholder; for encrypted messages normally [E2EE message].",
        "last_message_type": "Type recorded for the latest message, for example e2ee.",
        "last_message_sender": "Account ID that sent the latest message.",
        "last_message_status": "Summary status such as sent, delivered, or seen.",
        "last_message_at": "Time of the latest message.",
        "typing": "JSONB map for typing indicators; updated through the meta route.",
        "unread_by": "JSONB map of unread counts by account ID.",
        "cleared_at_by": "Reserved per-user clear marker; current clear route uses messages.deleted_for instead.",
        "created_at": "When this chat summary was first created.",
        "updated_at": "When this summary was last changed.",
    },
    "messages": {
        "id": "Database-generated row UUID; differs from the encrypted envelope's message_id.",
        "thread_type": "direct, group, or channel.",
        "thread_id": "Conversation, group, or channel ID containing this message.",
        "sender_id": "Account ID supplied as message sender.",
        "receiver_id": "Direct-message recipient ID; usually absent for community posts.",
        "sender_name": "Display name supplied for the sender.",
        "body": "JSONB payload. Current direct messages contain ciphertext, nonces, key wraps, signed metadata; community posts contain ordinary content.",
        "delivered_to": "Account IDs marked as delivered.",
        "read_by": "Account IDs marked as read.",
        "deleted_for": "Account IDs for whom the row is hidden.",
        "deleted_for_everyone": "Tombstone flag shown to all viewers; it does not erase the row or ciphertext.",
        "created_at": "Original storage time.",
        "edited_at": "Last edit time, if edited.",
        "deleted_at": "Time the everyone-deletion flag was set, if used.",
    },
    "call_logs": {
        "id": "Unique call-history row ID.",
        "conversation_id": "Direct-chat ID associated with the call.",
        "data": "JSONB with type, direction, status, start/end, duration, caller, receiver.",
        "created_at": "When this log row was inserted.",
    },
    "signals": {
        "id": "Unique signaling row ID; recipient deletes it after handling.",
        "conversation_id": "Direct-chat ID that routes the signal.",
        "type": "Offer, answer, ICE/candidate, or hangup label.",
        "sender": "Caller/sender account ID supplied in the signal.",
        "receiver": "Recipient account ID used by signal polling.",
        "data": "JSONB signal body, including WebRTC SDP or ICE candidate data.",
        "created_at": "When the signal was inserted.",
    },
    "user_devices": {
        "device_id": "Historical device ID.",
        "user_id": "Account ID associated with the historical device.",
        "kex_algorithm": "Historical key-exchange algorithm label, default x25519.",
        "identity_public_key_b64": "Historical identity public key encoded as Base64.",
        "signed_prekey_public_key_b64": "Historical signed prekey public value.",
        "signed_prekey_signature_b64": "Historical signature over the signed prekey.",
        "identity_sign_public_key_b64": "Historical public signing key; added by compatibility migration.",
        "created_at": "Historical row creation time.",
        "updated_at": "Historical row update time.",
    },
    "one_time_prekeys": {
        "id": "Unique historical prekey row ID.",
        "user_id": "Historical owner account ID.",
        "device_id": "Historical device ID.",
        "prekey_id": "Identifier unique with device_id.",
        "prekey_public_key_b64": "Historical one-time public prekey value.",
        "consumed_at": "When the prekey was used, if ever.",
        "created_at": "When the prekey row was made.",
    },
    "e2ee_sessions": {
        "id": "Unique historical session row ID.",
        "thread_id": "Historical conversation/thread ID.",
        "user_id": "Historical session owner account ID.",
        "peer_user_id": "Historical peer account ID.",
        "root_key_b64": "Historical root key material stored by the older design; current v2 does not write it.",
        "send_chain_key_b64": "Historical sending-chain key material; current v2 does not use it.",
        "recv_chain_key_b64": "Historical receiving-chain key material; current v2 does not use it.",
        "send_counter": "Historical number of messages sent in this session.",
        "recv_counter": "Historical number of messages received in this session.",
        "created_at": "Historical row creation time.",
        "updated_at": "Historical row update time.",
    },
    "e2ee_replay_index": {
        "id": "Unique historical replay row ID.",
        "thread_id": "Historical thread ID.",
        "recipient_user_id": "Historical recipient account ID.",
        "sender_user_id": "Historical sender account ID.",
        "msg_counter": "Historical per-sender message counter checked against reuse.",
        "consumed_at": "When the counter was recorded.",
    },
    "crypto_public_identities": {
        "user_id": "Owner account ID; one current identity per user and suite.",
        "suite_id": "Cryptographic suite label; current API accepts pqc only.",
        "device_id": "Browser device ID for the currently registered bundle.",
        "bundle": "JSONB signed public bundle with ML-KEM and ML-DSA public keys and signature. No private key.",
        "updated_at": "Last public-bundle registration time.",
    },
    "crypto_message_receipts": {
        "message_id": "Client-generated UUID already accepted by the relay; primary key prevents reuse.",
        "received_at": "When the relay recorded that UUID.",
    },
}


GLOSSARY = [
    ("Table / row / column", "A table is like a spreadsheet, a row is one item, and a column is one kind of fact about it."),
    ("Frontend / backend", "The frontend is the interface running in your browser. The backend is the Python server that answers API requests and uses PostgreSQL."),
    ("API route", "A URL and HTTP method, such as POST /api/auth/login, that calls a backend function."),
    ("JSONB", "A PostgreSQL field that stores structured JSON. Message envelopes and call details use it instead of one SQL column per detail."),
    ("UUID / UID", "A unique identifier. users.uid is the app's text account ID; many rows and encrypted messages use UUIDs."),
    ("JWT bearer token", "A signed session ticket sent with API requests. It proves which account is making a request until it expires."),
    ("Hash", "A one-way transformation used for password checking. The password_hash column is not reversible plaintext."),
    ("Public / private key", "A public key can be shared. The matching private key must stay with its owner; here it is kept in that browser's IndexedDB."),
    ("Ciphertext / plaintext", "Plaintext is readable content. Ciphertext is the encrypted result stored for direct messages."),
    ("Nonce", "A fresh value supplied to AES-GCM for an encryption operation. It is stored with ciphertext and is not a secret key."),
    ("Key wrap", "Encrypting a message's AES key under a separate wrapping key so the intended reader can recover it."),
    ("KEM / signature", "ML-KEM helps two parties establish a shared secret. ML-DSA signs data so the recipient can check its source and integrity."),
    ("RSA / ECDH", "Examples of older public-key methods used for key exchange or signatures. Large future quantum computers could threaten their underlying math."),
    ("Browser origin / ngrok", "An origin is the URL's scheme, host, and port. Ngrok gives another device a public HTTPS URL; that URL has separate browser key storage from localhost."),
    ("STUN / TURN", "WebRTC connection helpers. STUN helps peers discover paths; a TURN server relays media when direct paths fail. This project configures STUN only."),
]


def rgb(value: str) -> RGBColor:
    return RGBColor.from_string(value)


def shade(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_border(cell, side: str, color: str = LINE, size: int = 5):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    edge = OxmlElement(f"w:{side}")
    edge.set(qn("w:val"), "single")
    edge.set(qn("w:sz"), str(size))
    edge.set(qn("w:color"), color)
    borders.append(edge)


def no_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    tr_pr.append(OxmlElement("w:cantSplit"))


def keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


def set_run(run, *, bold=False, color=INK, size=9.3, font="Aptos"):
    run.bold = bold
    run.font.name = font
    run.font.size = Pt(size)
    run.font.color.rgb = rgb(color)
    return run


def add_inline(paragraph, text: str):
    """Render the small Markdown subset used by the source guide."""
    pattern = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^]]+\]\([^)]+\))")
    cursor = 0
    for match in pattern.finditer(text):
        if match.start() > cursor:
            set_run(paragraph.add_run(text[cursor:match.start()]))
        token = match.group(0)
        if token.startswith("**"):
            set_run(paragraph.add_run(token[2:-2]), bold=True)
        elif token.startswith("`"):
            set_run(paragraph.add_run(token[1:-1]), color=PURPLE, size=8.8, font="Consolas")
        else:
            label = token[1:token.index("](")]
            run = set_run(paragraph.add_run(label), bold=True, color=CYAN)
            run.underline = True
        cursor = match.end()
    if cursor < len(text):
        set_run(paragraph.add_run(text[cursor:]))


def add_page_number(paragraph):
    paragraph.add_run("Page ")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    paragraph._p.append(field)


def setup_document() -> Document:
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = Inches(.72)
    section.bottom_margin = Inches(.64)
    section.left_margin = Inches(.78)
    section.right_margin = Inches(.78)
    section.header_distance = Inches(.25)
    section.footer_distance = Inches(.28)
    section.different_first_page_header_footer = True

    normal = doc.styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(9.3)
    normal.font.color.rgb = rgb(INK)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.16

    for name, size, before, after, color in [
        ("Title", 32, 0, 18, NAVY),
        ("Heading 1", 17, 19, 8, NAVY),
        ("Heading 2", 12.5, 13, 5, CYAN),
        ("Heading 3", 10.4, 9, 4, PURPLE),
    ]:
        style = doc.styles[name]
        style.font.name = "Aptos Display" if name in {"Title", "Heading 1"} else "Aptos"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = rgb(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for name in ["List Bullet", "List Number"]:
        doc.styles[name].font.name = "Aptos"
        doc.styles[name].font.size = Pt(9.3)
        doc.styles[name].paragraph_format.space_after = Pt(3)

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run(header.add_run("QUANTX  /  PROJECT HANDBOOK"), bold=True, color=CYAN, size=7.4)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run(footer.add_run("Source-based guide  •  1 November 2026     "), color=MUTED, size=7.5)
    add_page_number(footer)
    doc.core_properties.title = "QUANTX Project Handbook: Frontend to Backend"
    doc.core_properties.subject = "Data flow, database structure, cryptography, calls, and function directory"
    doc.core_properties.keywords = "QUANTX, React, FastAPI, PostgreSQL, PQC, project handbook"
    doc.core_properties.author = "QUANTX Project"
    return doc


def add_table(doc: Document, headers: list[str], rows: list[list[str]], widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    table.autofit = widths is None
    if widths:
        for cell, width in zip(table.rows[0].cells, widths):
            cell.width = Inches(width)
    for index, title in enumerate(headers):
        cell = table.rows[0].cells[index]
        shade(cell, NAVY)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        cell.text = ""
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        set_run(p.add_run(title), bold=True, color=WHITE, size=8.5)
    no_split(table.rows[0])
    header_props = table.rows[0]._tr.get_or_add_trPr()
    header_props.append(OxmlElement("w:tblHeader"))
    for row_index, values in enumerate(rows):
        row = table.add_row()
        no_split(row)
        for cell_index, value in enumerate(values):
            cell = row.cells[cell_index]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            if row_index % 2 == 0:
                shade(cell, LIGHT)
            cell.text = ""
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(1)
            add_inline(paragraph, value.strip())
            if widths:
                cell.width = Inches(widths[cell_index])
            set_cell_border(cell, "bottom")
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def diagram(name: str, temp: Path) -> Path:
    common = f'''digraph G {{
        graph [bgcolor="white", pad="0.18", nodesep="0.30", ranksep="0.42", splines=ortho, dpi=190];
        node [shape=box, style="rounded,filled", color="#{CYAN}", fillcolor="#{PALE}",
              fontname="DejaVu Sans", fontsize=10, fontcolor="#{NAVY}", margin="0.18,0.12"];
        edge [color="#{PURPLE}", penwidth=1.6, arrowsize=0.7];
    '''
    if name == "architecture":
        body = '''rankdir=LR;
            Alice [label="ALICE'S BROWSER\\nReact UI + private keys", fillcolor="#EAF7FB"];
            Service [label="Frontend services\\nAPI requests + encryption", fillcolor="#F1EDFA"];
            Server [label="FASTAPI SERVER\\nRoutes + validation", fillcolor="#EAF7FB"];
            DB [label="POSTGRESQL\\nAccounts + encrypted envelopes", fillcolor="#F1EDFA"];
            Files [label="LOCAL FILES\\nUploaded media bytes", fillcolor="#F5F7FB"];
            Bob [label="BOB'S BROWSER\\nVerify + decrypt", fillcolor="#EAF7FB"];
            Alice -> Service -> Server -> DB;
            Server -> Files;
            Server -> Bob [xlabel="ciphertext / public data", fontname="DejaVu Sans", fontsize=8];
        '''
    elif name == "login":
        body = '''rankdir=LR;
            Form [label="1  Enter email, password\\n(and phone when registering)"];
            API [label="2  FastAPI checks account\\nand Argon2id hash", fillcolor="#F1EDFA"];
            Token [label="3  JWT session ticket\\nreturned to browser"];
            Keys [label="4  Browser loads or makes\\nKyber + Dilithium keys", fillcolor="#F1EDFA"];
            Public [label="5  Public bundle saved\\nin PostgreSQL"];
            Form -> API -> Token -> Keys -> Public;
        '''
    elif name == "message":
        body = '''rankdir=LR;
            Draft [label="1  Alice types\\nreadable message"];
            KEM [label="2  Kyber + HKDF\\nprotect fresh AES key", fillcolor="#F1EDFA"];
            AES [label="3  AES-GCM encrypts\\nmessage bytes"];
            DSA [label="4  Dilithium signs\\nencrypted packet", fillcolor="#F1EDFA"];
            Relay [label="5  Server stores\\nciphertext only"];
            Open [label="6  Bob verifies\\nand decrypts", fillcolor="#EAF7FB"];
            Draft -> KEM -> AES -> DSA -> Relay -> Open;
        '''
    elif name == "delete":
        body = '''rankdir=LR;
            Action [label="User chooses a delete action", fillcolor="#F1EDFA"];
            Me [label="For me\\nadd user ID to deleted_for"];
            Everyone [label="For everyone\\nset deleted_for_everyone"];
            Clear [label="Clear chat\\nmark all direct rows for one user"];
            Storage [label="PostgreSQL row remains\\n(ciphertext remains too)", fillcolor="#FFF2E8", color="#C26B22"];
            Action -> Me; Action -> Everyone; Action -> Clear;
            Me -> Storage; Everyone -> Storage; Clear -> Storage;
        '''
    elif name == "calls":
        body = '''rankdir=LR;
            Caller [label="Caller browser\\ngets mic/camera"];
            Offer [label="Offer + ICE candidate\\nwritten to signals", fillcolor="#F1EDFA"];
            Answer [label="Recipient polls signals\\nand writes answer"];
            Peer [label="WebRTC peer connection\\ntries to carry media", fillcolor="#F1EDFA"];
            Log [label="Call log JSONB\\nwritten on hangup"];
            Caller -> Offer -> Answer -> Peer -> Log;
        '''
    else:
        raise ValueError(name)
    dot_file = temp / f"{name}.dot"
    png_file = temp / f"{name}.png"
    dot_file.write_text(common + body + "}\n")
    subprocess.run(["dot", "-Tpng", str(dot_file), "-o", str(png_file)], check=True)
    return png_file


def add_diagram(doc: Document, path: Path, caption: str):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(3)
    p.add_run().add_picture(str(path), width=Inches(6.62))
    label = doc.add_paragraph()
    label.alignment = WD_ALIGN_PARAGRAPH.CENTER
    label.paragraph_format.space_after = Pt(9)
    set_run(label.add_run(caption), color=MUTED, size=7.8)


def add_cover(doc: Document, images: dict[str, Path]):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(33)
    set_run(p.add_run("QUANTX  /  SYSTEM EXPLAINED"), bold=True, color=CYAN, size=10)
    title = doc.add_paragraph(style="Title")
    title.paragraph_format.space_before = Pt(28)
    title.add_run("From the screen\nto the database")
    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(23)
    set_run(subtitle.add_run("A complete, plain-language guide to accounts, messages, cryptography, calls, APIs, functions, and every PostgreSQL table."),
            color=MUTED, size=14)
    add_diagram(doc, images["architecture"], "The path a user action follows through QUANTX")
    add_table(doc, ["WHAT YOU WILL LEARN", "WHERE TO LOOK"], [
        ["How a user signs in and gets message keys", "Login flow and identity storage"],
        ["Why Kyber, Dilithium, and AES work together", "PQC explanation and message flow"],
        ["How messages are sent, read, edited, and deleted", "Message and deletion flows"],
        ["What each of the 16 database tables and every field mean", "Database dictionary"],
        ["Which operations are built in and which were written for this project", "Function directory"],
        ["Which parts are incomplete in the current code", "Current implementation gaps"],
    ], widths=[3.25, 3.25])
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    set_run(p.add_run(f"Source code snapshot  •  {date(2026, 11, 1).strftime('%d %B %Y')}"), color=MUTED, size=8.5)
    doc.add_page_break()


def add_reading_page(doc: Document):
    doc.add_heading("How to read this handbook", level=1)
    p = doc.add_paragraph()
    add_inline(p, "Start with **The short version** for the overall path, then **Why Kyber, Dilithium, and AES are used together** for the encryption idea. The numbered flows show what happens when a person clicks something. The **16 PostgreSQL tables** section gives a quick map; the **Database dictionary** at the end lists every field and its meaning. The **function directory** distinguishes project code from React, browser, Python-library, and PostgreSQL capabilities.")
    p = doc.add_paragraph()
    add_inline(p, "**Important scope:** This document explains the checked-in code, not a live dump of your current database. The PostgreSQL server was unavailable when this handbook was produced. The final SQL section contains read-only commands you can run after it is started. No passwords or secret values from `.env` are included.")
    doc.add_heading("Contents", level=2)
    add_table(doc, ["PART", "QUESTION ANSWERED"], [
        ["1 · Orientation", "Where does information live, and which component owns it?"],
        ["2 · Database map", "What is each of the 16 PostgreSQL tables for?"],
        ["3 · User journeys", "How do login, contacts, messages, deletion, groups, and calls work?"],
        ["4 · Code and functions", "Which APIs and functions are built in versus written here?"],
        ["5 · Current limitations", "What is only partly connected or needs stronger server checks?"],
        ["6 · Database dictionary", "What does every table field mean?"],
        ["7 · Inspection", "How can I safely examine the running PostgreSQL database?"],
    ], widths=[1.58, 4.92])
    doc.add_heading("Plain-language glossary", level=2)
    add_table(doc, ["TERM", "MEANING"], [[term, meaning] for term, meaning in GLOSSARY], widths=[1.65, 4.85])
    doc.add_page_break()


def parse_schema():
    text = SCHEMA.read_text()
    result = []
    for table_name, body in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)^\);", text, re.S | re.M):
        fields = []
        for line in body.splitlines():
            value = line.strip().rstrip(",")
            if not value or value.startswith("--") or value.startswith(("UNIQUE", "PRIMARY KEY", "CHECK", "FOREIGN KEY")):
                continue
            name = value.split()[0]
            fields.append((name, value[len(name):].strip()))
        result.append((table_name, fields))
    assert len(result) == 16, f"Expected 16 tables, found {len(result)}"
    for table_name, fields in result:
        known = FIELD_MEANINGS[table_name]
        missing = [field for field, _ in fields if field not in known]
        assert not missing, f"Missing field explanations for {table_name}: {missing}"
    return result


def add_database_dictionary(doc: Document):
    doc.add_heading("Database dictionary: every table and field", level=1)
    p = doc.add_paragraph()
    add_inline(p, "The SQL definition column is taken from `py_backend/app/schema.sql`. A field's default is what PostgreSQL uses when a new row omits it. `NOT NULL` means the field is required at database level. A JSONB field can contain several named properties. This dictionary describes the schema, while the earlier flow sections explain how the app currently uses it.")
    for index, (table_name, fields) in enumerate(parse_schema(), 1):
        doc.add_heading(f"{index:02d}  {table_name}", level=2)
        p = doc.add_paragraph()
        add_inline(p, TABLE_INTROS[table_name])
        keep_with_next(p)
        if table_name in {"user_devices", "one_time_prekeys", "e2ee_sessions", "e2ee_replay_index"}:
            p = doc.add_paragraph()
            set_run(p.add_run("Historical table: retained in SQL but unused by current protocol-v2 routes."), bold=True, color=PURPLE, size=8.5)
        add_table(doc, ["FIELD", "SQL DEFINITION", "PLAIN MEANING"],
                  [[f"`{field}`", f"`{sql}`", FIELD_MEANINGS[table_name][field]] for field, sql in fields],
                  widths=[1.27, 2.3, 2.93])
        if table_name == "users":
            p = doc.add_paragraph()
            add_inline(p, "**Additional indexes:** `users_email_lower_unique` prevents case-insensitive duplicate emails; `users_phone_unique` prevents duplicate nonempty phone numbers. Normalization runs before the phone index is created.")
        if table_name == "messages":
            p = doc.add_paragraph()
            add_inline(p, "**Additional indexes:** `messages_crypto_message_id` enforces uniqueness of v2 `body.message_id` among stored messages; `messages_pqc_created_at_idx` speeds up admin's PQC-message listing. `crypto_message_receipts` also remembers accepted IDs after a row is edited or hidden.")
        if table_name == "crypto_public_identities":
            p = doc.add_paragraph()
            add_inline(p, "**Composite primary key:** `(user_id, suite_id)` means one active PQC bundle per account, not one row for every browser/device.")


def add_source_notes(doc: Document):
    doc.add_heading("Source files and maintenance", level=1)
    add_table(doc, ["QUESTION", "SOURCE OF TRUTH"], [
        ["What tables and indexes exist?", "py_backend/app/schema.sql"],
        ["How does the backend connect to PostgreSQL?", "py_backend/app/db.py and py_backend/app/config.py"],
        ["Which HTTP routes exist?", "py_backend/app/routes/*.py and /docs on a running server"],
        ["How are UI actions turned into requests?", "frontend/src/App.js, components/chatwindow/ChatWindow.jsx, frontend/src/services/*.js"],
        ["How do direct-message keys and ciphertext work?", "frontend/src/crypto/protocol/messageEncryption.js and frontend/src/crypto/providers/postQuantum.js"],
        ["Where are browser private keys kept?", "frontend/src/crypto/storage/identityStore.js"],
        ["Where can I read the editable Markdown version?", "docs/PROJECT_DATA_FLOW.md"],
    ], widths=[2.65, 3.85])
    p = doc.add_paragraph()
    add_inline(p, "To regenerate this document after code changes, run `python3 scripts/build-project-guide-docx.py` from the project root. The script reads the Markdown guide and SQL schema, checks that all 16 tables and their fields have explanations, then writes `QUANTX_Project_Handbook.docx` beside `README.md`.")


def render_markdown(doc: Document, images: dict[str, Path]):
    lines = SOURCE.read_text().splitlines()
    i = 0
    pending_diagram = None
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("# "):
            # The Word cover already carries the full title.
            i += 1
            continue
        if stripped.startswith("## "):
            heading = stripped[3:]
            if heading == "Read-only PostgreSQL inspection":
                # Put inspection after the field-by-field appendix.
                add_database_dictionary(doc)
            doc.add_heading(heading, level=1)
            if heading == "The short version":
                pending_diagram = "architecture"
            elif heading.startswith("Flow 1:"):
                pending_diagram = "login"
            elif heading.startswith("Flow 3:"):
                pending_diagram = "message"
            elif heading.startswith("Flow 4:"):
                add_diagram(doc, images["delete"], "Delete actions update visibility flags; they do not physically remove the message row")
            elif heading.startswith("Flow 6:"):
                add_diagram(doc, images["calls"], "The backend carries call setup messages; the browser attempts the media connection")
            i += 1
            continue
        if stripped.startswith("### "):
            doc.add_heading(stripped[4:], level=2)
            i += 1
            continue
        if stripped == "```mermaid":
            i += 1
            while i < len(lines) and lines[i].strip() != "```":
                i += 1
            if pending_diagram:
                captions = {
                    "architecture": "From a browser click to the Python server, database, and recipient browser",
                    "login": "Account sign-in is followed by local PQC identity preparation",
                    "message": "A readable direct message is encrypted before the server stores it",
                }
                add_diagram(doc, images[pending_diagram], captions[pending_diagram])
                pending_diagram = None
            i += 1
            continue
        if stripped.startswith("```"):
            language = stripped[3:]
            block = []
            i += 1
            while i < len(lines) and lines[i].strip() != "```":
                block.append(lines[i])
                i += 1
            if language in {"sql", "bash"}:
                cell = doc.add_table(rows=1, cols=1).cell(0, 0)
                shade(cell, LIGHT)
                cell.text = ""
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.05
                set_run(p.add_run("\n".join(block)), color=NAVY, size=8.2, font="Consolas")
                doc.add_paragraph()
            i += 1
            continue
        if stripped.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([v.strip() for v in lines[i].strip().strip("|").split("|")])
                i += 1
            if len(rows) >= 2:
                headers = rows[0]
                values = [row for row in rows[2:] if len(row) == len(headers)]
                add_table(doc, headers, values)
            continue
        numbered = re.match(r"^\d+\.\s+(.*)$", stripped)
        if numbered:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(.24)
            p.paragraph_format.first_line_indent = Inches(-.24)
            set_run(p.add_run(f"{stripped.split('.', 1)[0]}.  "), bold=True, color=CYAN)
            add_inline(p, numbered.group(1))
        elif stripped.startswith("- "):
            p = doc.add_paragraph(style="List Bullet")
            add_inline(p, stripped[2:])
        else:
            p = doc.add_paragraph()
            if stripped.startswith("**") and stripped.endswith("**") and stripped.count("**") == 2:
                p.style = "Heading 3"
            add_inline(p, stripped)
        i += 1


def main():
    doc = setup_document()
    with tempfile.TemporaryDirectory(prefix="quantx-docx-") as tmp:
        temp = Path(tmp)
        images = {name: diagram(name, temp) for name in ("architecture", "login", "message", "delete", "calls")}
        add_cover(doc, images)
        add_reading_page(doc)
        render_markdown(doc, images)
        add_source_notes(doc)
        doc.save(OUTPUT)
    print(f"Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
