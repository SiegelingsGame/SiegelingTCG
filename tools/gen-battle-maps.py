#!/usr/bin/env python3
"""Generate the 18 Siege battle-map SVG compositions (9× landscape + portrait).

Style matches location-stage camp/cache/smith: flat vector, 3–5 depth bands,
one radial light pool, hero props with near-black stroke + feDropShadow.
Horizon anchored at 45% height; light pool at x=50%. The compositions are
deliberately static so the full-screen layer never creates a repaint loop.
"""
from __future__ import annotations

import os
import re

ROOT = os.path.join(
    os.path.dirname(__file__),
    "..",
    "src",
    "main",
    "resources",
    "static",
    "img",
    "maps",
)


def round_nums(svg: str) -> str:
    """SVGO-ish: precision 2 on floating numbers."""

    def repl(m: re.Match) -> str:
        v = float(m.group(0))
        if abs(v - round(v)) < 1e-9:
            return str(int(round(v)))
        return f"{v:.2f}".rstrip("0").rstrip(".")

    return re.sub(r"-?\d+\.\d+", repl, svg)


def wrap(w: int, h: int, body: str) -> str:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">'
        f"{body}</svg>"
    )
    return round_nums(svg)


def defs(sky_stops: str, glow_stops: str, glow_cx="50%", glow_cy="48%", glow_r="42%") -> str:
    return (
        "<defs>"
        f'<linearGradient id="sky" x2="0" y2="1">{sky_stops}</linearGradient>'
        f'<radialGradient id="glow" cx="{glow_cx}" cy="{glow_cy}" r="{glow_r}">'
        f"{glow_stops}</radialGradient>"
        '<filter id="prop"><feDropShadow dx="0" dy="6" stdDeviation="4" flood-opacity=".4"/></filter>'
        "</defs>"
    )


# ── shared helpers ──────────────────────────────────────────────────────────

def sky_rect(w, h):
    return f'<rect width="{w}" height="{h}" fill="url(#sky)"/>'


def glow_ellipse(cx, cy, rx, ry):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#glow)"/>'


# ── map builders ────────────────────────────────────────────────────────────

def muster_field(land: bool) -> str:
    """Trampled grass, palisade stakes, dawn haze, distant tents."""
    if land:
        w, h, hz = 1200, 680, 306
        body = (
            defs(
                '<stop stop-color="#3a4a62"/><stop offset=".42" stop-color="#5a6a5e"/>'
                '<stop offset=".72" stop-color="#3d4a38"/><stop offset="1" stop-color="#1a2218"/>',
                '<stop stop-color="#ffd48a" stop-opacity=".55"/><stop offset=".5" stop-color="#ff9a3c" stop-opacity=".18"/>'
                '<stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/>',
                glow_cy="42%",
            )
            + sky_rect(w, h)
            + f'<ellipse cx="980" cy="118" rx="70" ry="70" fill="#f5e6c8" opacity=".55"/>'
            + f'<path d="M0 {hz+20}L140 220 280 300 420 200 580 295 760 215 940 290 1100 210 1200 {hz}V680H0Z" fill="#1a2820"/>'
            + f'<path d="M0 380Q200 340 400 375T800 365T1200 350V680H0Z" fill="#24352a"/>'
            + f'<path d="M0 460Q250 410 500 455T1000 440T1200 470V680H0Z" fill="#18251e"/>'
            + glow_ellipse(600, 340, 280, 160)
            + '<g filter="url(#prop)">'
            # tents (focal)
            + '<path d="M520 300L580 230 640 300Z" fill="#8a6a48" stroke="#1a1410" stroke-width="8"/>'
            + '<path d="M580 230V302" stroke="#d4b896" stroke-width="5"/>'
            + '<path d="M680 310L740 248 800 310Z" fill="#7a5c40" stroke="#1a1410" stroke-width="8"/>'
            + '<path d="M740 248V312" stroke="#d4b896" stroke-width="5"/>'
            # palisade stakes quiet left/right of focal
            + '<path d="M360 290L368 220M390 295L396 225M420 288L428 218" stroke="#3a2a18" stroke-width="7" stroke-linecap="round"/>'
            + '<path d="M850 292L858 222M880 298L886 228M910 290L918 220" stroke="#3a2a18" stroke-width="7" stroke-linecap="round"/>'
            + "</g>"
            # near ground texture strip
            + f'<path d="M0 560Q300 540 600 555T1200 545V680H0Z" fill="#121a14" opacity=".7"/>'
        )
        return wrap(w, h, body)
    # portrait
    w, h, hz = 900, 800, 360
    body = (
        defs(
            '<stop stop-color="#3a4a62"/><stop offset=".4" stop-color="#5a6a5e"/>'
            '<stop offset=".7" stop-color="#3d4a38"/><stop offset="1" stop-color="#1a2218"/>',
            '<stop stop-color="#ffd48a" stop-opacity=".55"/><stop offset=".5" stop-color="#ff9a3c" stop-opacity=".18"/>'
            '<stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/>',
            glow_cy="45%",
        )
        + sky_rect(w, h)
        + f'<ellipse cx="720" cy="140" rx="58" ry="58" fill="#f5e6c8" opacity=".55"/>'
        + f'<path d="M0 {hz}L100 260 220 340 360 250 500 335 640 255 780 330 900 {hz-10}V800H0Z" fill="#1a2820"/>'
        + f'<path d="M0 420Q180 380 400 415T750 400T900 430V800H0Z" fill="#24352a"/>'
        + f'<path d="M0 520Q220 470 450 510T900 500V800H0Z" fill="#18251e"/>'
        + glow_ellipse(450, 400, 240, 140)
        + '<g filter="url(#prop)">'
        + '<path d="M380 350L440 280 500 350Z" fill="#8a6a48" stroke="#1a1410" stroke-width="8"/>'
        + '<path d="M440 280V352" stroke="#d4b896" stroke-width="5"/>'
        + '<path d="M530 360L590 295 650 360Z" fill="#7a5c40" stroke="#1a1410" stroke-width="8"/>'
        + '<path d="M590 295V362" stroke="#d4b896" stroke-width="5"/>'
        + '<path d="M250 340L256 275M280 345L285 278M310 338L316 272" stroke="#3a2a18" stroke-width="7" stroke-linecap="round"/>'
        + '<path d="M700 342L706 275M730 348L735 278M760 340L766 272" stroke="#3a2a18" stroke-width="7" stroke-linecap="round"/>'
        + "</g>"
        + f'<path d="M0 680Q250 660 450 675T900 665V800H0Z" fill="#121a14" opacity=".7"/>'
    )
    return wrap(w, h, body)


def ash_road(land: bool) -> str:
    """Burnt farmland, cart wreck, smoke columns, low orange sun."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#2a1810"/><stop offset=".35" stop-color="#5a3020"/>'
                '<stop offset=".65" stop-color="#3a2418"/><stop offset="1" stop-color="#161008"/>',
                '<stop stop-color="#ff9a3c" stop-opacity=".7"/><stop offset=".4" stop-color="#e86020" stop-opacity=".28"/>'
                '<stop offset="1" stop-color="#e86020" stop-opacity="0"/>',
                glow_cy="40%", glow_r="38%",
            )
            + sky_rect(w, h)
            + '<ellipse cx="200" cy="200" rx="90" ry="90" fill="#ff9a3c" opacity=".65"/>'
            + '<path d="M0 300L180 240 340 290 520 230 700 285 880 235 1060 280 1200 250V680H0Z" fill="#2a1a12"/>'
            + '<path d="M0 380Q220 350 450 375T900 360T1200 390V680H0Z" fill="#1e1410"/>'
            + '<path d="M0 470Q300 430 600 465T1200 455V680H0Z" fill="#161008"/>'
            + glow_ellipse(600, 320, 260, 140)
            # smoke columns (quiet mid)
            + '<ellipse cx="380" cy="220" rx="28" ry="70" fill="#3a3028" opacity=".45"/>'
            + '<ellipse cx="820" cy="200" rx="32" ry="85" fill="#3a3028" opacity=".4"/>'
            + '<ellipse cx="500" cy="190" rx="22" ry="55" fill="#4a3830" opacity=".35"/>'
            + '<g filter="url(#prop)">'
            # cart wreck
            + '<path d="M540 340L620 310 700 345 680 380 560 375Z" fill="#4a3020" stroke="#120c08" stroke-width="8"/>'
            + '<circle cx="570" cy="375" r="28" fill="none" stroke="#120c08" stroke-width="9"/>'
            + '<circle cx="670" cy="378" r="28" fill="none" stroke="#120c08" stroke-width="9"/>'
            + '<path d="M600 310L615 260" stroke="#3a2818" stroke-width="8" stroke-linecap="round"/>'
            + "</g>"
            + '<path d="M0 560Q400 540 800 555T1200 545V680H0Z" fill="#0e0a06" opacity=".75"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#2a1810"/><stop offset=".35" stop-color="#5a3020"/>'
            '<stop offset=".65" stop-color="#3a2418"/><stop offset="1" stop-color="#161008"/>',
            '<stop stop-color="#ff9a3c" stop-opacity=".7"/><stop offset=".4" stop-color="#e86020" stop-opacity=".28"/>'
            '<stop offset="1" stop-color="#e86020" stop-opacity="0"/>',
            glow_cy="42%",
        )
        + sky_rect(w, h)
        + '<ellipse cx="160" cy="220" rx="72" ry="72" fill="#ff9a3c" opacity=".65"/>'
        + '<path d="M0 350L140 280 280 340 440 270 600 335 760 275 900 330V800H0Z" fill="#2a1a12"/>'
        + '<path d="M0 430Q200 400 450 425T900 415V800H0Z" fill="#1e1410"/>'
        + '<path d="M0 530Q250 490 500 520T900 510V800H0Z" fill="#161008"/>'
        + glow_ellipse(450, 380, 220, 130)
        + '<ellipse cx="300" cy="260" rx="24" ry="60" fill="#3a3028" opacity=".45"/>'
        + '<ellipse cx="620" cy="245" rx="28" ry="70" fill="#3a3028" opacity=".4"/>'
        + '<g filter="url(#prop)">'
        + '<path d="M380 400L460 370 540 405 520 440 400 435Z" fill="#4a3020" stroke="#120c08" stroke-width="8"/>'
        + '<circle cx="410" cy="435" r="24" fill="none" stroke="#120c08" stroke-width="9"/>'
        + '<circle cx="500" cy="438" r="24" fill="none" stroke="#120c08" stroke-width="9"/>'
        + '<path d="M440 370L452 325" stroke="#3a2818" stroke-width="8" stroke-linecap="round"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#0e0a06" opacity=".75"/>'
    )
    return wrap(w, h, body)


def tourney_yard(land: bool) -> str:
    """Tilt-yard fencing, torn pennants, packed sand."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#4a5568"/><stop offset=".4" stop-color="#6a7058"/>'
                '<stop offset=".7" stop-color="#5a4a30"/><stop offset="1" stop-color="#2a2218"/>',
                '<stop stop-color="#ffe0a0" stop-opacity=".5"/><stop offset=".45" stop-color="#d4a060" stop-opacity=".2"/>'
                '<stop offset="1" stop-color="#d4a060" stop-opacity="0"/>',
                glow_cy="44%",
            )
            + sky_rect(w, h)
            + '<ellipse cx="900" cy="100" rx="55" ry="55" fill="#ffe8c0" opacity=".5"/>'
            + '<path d="M0 310L200 250 400 300 600 240 800 295 1000 245 1200 290V680H0Z" fill="#3a3428"/>'
            + '<path d="M0 400Q250 360 500 395T1000 380T1200 410V680H0Z" fill="#4a3e2a"/>'
            + '<path d="M0 480Q300 450 600 475T1200 465V680H0Z" fill="#2a2218"/>'
            + glow_ellipse(600, 350, 300, 150)
            + '<g filter="url(#prop)">'
            # tilt fence rails
            + '<path d="M480 280H720" stroke="#1a1410" stroke-width="10" stroke-linecap="round"/>'
            + '<path d="M490 310H710" stroke="#1a1410" stroke-width="8" stroke-linecap="round"/>'
            + '<path d="M500 250V320M600 245V325M700 250V320" stroke="#2a2018" stroke-width="9" stroke-linecap="round"/>'
            # pennants
            + '<path d="M500 250L540 235 500 268Z" fill="#c04030" stroke="#1a1010" stroke-width="5"/>'
            + '<path d="M700 250L740 238 700 270Z" fill="#3ea6ff" stroke="#101820" stroke-width="5"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#1a1610" opacity=".65"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#4a5568"/><stop offset=".4" stop-color="#6a7058"/>'
            '<stop offset=".7" stop-color="#5a4a30"/><stop offset="1" stop-color="#2a2218"/>',
            '<stop stop-color="#ffe0a0" stop-opacity=".5"/><stop offset=".45" stop-color="#d4a060" stop-opacity=".2"/>'
            '<stop offset="1" stop-color="#d4a060" stop-opacity="0"/>',
            glow_cy="45%",
        )
        + sky_rect(w, h)
        + '<ellipse cx="700" cy="120" rx="48" ry="48" fill="#ffe8c0" opacity=".5"/>'
        + '<path d="M0 360L150 300 320 350 480 290 650 345 800 295 900 340V800H0Z" fill="#3a3428"/>'
        + '<path d="M0 440Q200 405 450 435T900 420V800H0Z" fill="#4a3e2a"/>'
        + '<path d="M0 540Q250 505 500 530T900 520V800H0Z" fill="#2a2218"/>'
        + glow_ellipse(450, 410, 250, 130)
        + '<g filter="url(#prop)">'
        + '<path d="M340 330H560" stroke="#1a1410" stroke-width="10" stroke-linecap="round"/>'
        + '<path d="M350 360H550" stroke="#1a1410" stroke-width="8" stroke-linecap="round"/>'
        + '<path d="M360 300V370M450 295V375M540 300V370" stroke="#2a2018" stroke-width="9" stroke-linecap="round"/>'
        + '<path d="M360 300L400 285 360 318Z" fill="#c04030" stroke="#1a1010" stroke-width="5"/>'
        + '<path d="M540 300L580 288 540 320Z" fill="#3ea6ff" stroke="#101820" stroke-width="5"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#1a1610" opacity=".65"/>'
    )
    return wrap(w, h, body)


def moat_crossing(land: bool) -> str:
    """Flooded ditch, half-sunk pontoon, cold blue-green reflected light."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#0e1a28"/><stop offset=".4" stop-color="#1a3040"/>'
                '<stop offset=".7" stop-color="#163038"/><stop offset="1" stop-color="#0c181c"/>',
                '<stop stop-color="#3ea6ff" stop-opacity=".55"/><stop offset=".4" stop-color="#2a8a7a" stop-opacity=".25"/>'
                '<stop offset="1" stop-color="#2a8a7a" stop-opacity="0"/>',
                glow_cy="48%", glow_r="40%",
            )
            + sky_rect(w, h)
            + '<ellipse cx="150" cy="100" rx="40" ry="40" fill="#c8e0f0" opacity=".35"/>'
            + '<path d="M0 290L200 240 450 280 700 235 950 275 1200 250V680H0Z" fill="#142830"/>'
            + '<path d="M0 370Q250 340 500 365T1000 350T1200 380V680H0Z" fill="#1a3840"/>'
            # water band
            + '<path d="M0 420Q300 390 600 415T1200 400V500Q900 520 600 505T0 520Z" fill="#1a4850" opacity=".85"/>'
            + glow_ellipse(600, 360, 280, 120)
            + '<g filter="url(#prop)">'
            # pontoon
            + '<path d="M480 390L720 375 740 420 460 435Z" fill="#4a3a28" stroke="#101008" stroke-width="8"/>'
            + '<path d="M520 385V360M600 380V355M680 378V358" stroke="#2a2018" stroke-width="7" stroke-linecap="round"/>'
            + '<ellipse cx="550" cy="430" rx="40" ry="12" fill="#0a2030" opacity=".5"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#0a1418" opacity=".7"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#0e1a28"/><stop offset=".4" stop-color="#1a3040"/>'
            '<stop offset=".7" stop-color="#163038"/><stop offset="1" stop-color="#0c181c"/>',
            '<stop stop-color="#3ea6ff" stop-opacity=".55"/><stop offset=".4" stop-color="#2a8a7a" stop-opacity=".25"/>'
            '<stop offset="1" stop-color="#2a8a7a" stop-opacity="0"/>',
            glow_cy="48%",
        )
        + sky_rect(w, h)
        + '<ellipse cx="120" cy="130" rx="36" ry="36" fill="#c8e0f0" opacity=".35"/>'
        + '<path d="M0 340L160 290 360 330 560 285 760 325 900 300V800H0Z" fill="#142830"/>'
        + '<path d="M0 420Q200 390 450 415T900 400V800H0Z" fill="#1a3840"/>'
        + '<path d="M0 480Q250 450 500 475T900 460V560Q650 580 450 565T0 580Z" fill="#1a4850" opacity=".85"/>'
        + glow_ellipse(450, 420, 230, 110)
        + '<g filter="url(#prop)">'
        + '<path d="M340 450L560 435 580 480 320 495Z" fill="#4a3a28" stroke="#101008" stroke-width="8"/>'
        + '<path d="M380 445V420M450 440V415M520 438V418" stroke="#2a2018" stroke-width="7" stroke-linecap="round"/>'
        + '<ellipse cx="400" cy="490" rx="35" ry="10" fill="#0a2030" opacity=".5"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#0a1418" opacity=".7"/>'
    )
    return wrap(w, h, body)


def rampart_breach(land: bool) -> str:
    """Collapsed curtain wall, rubble ramp, siege ladder, dust plume."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#2a2838"/><stop offset=".4" stop-color="#4a4858"/>'
                '<stop offset=".7" stop-color="#3a3428"/><stop offset="1" stop-color="#1a1810"/>',
                '<stop stop-color="#d4b080" stop-opacity=".45"/><stop offset=".45" stop-color="#8a7050" stop-opacity=".18"/>'
                '<stop offset="1" stop-color="#8a7050" stop-opacity="0"/>',
                glow_cy="42%",
            )
            + sky_rect(w, h)
            + '<ellipse cx="1000" cy="90" rx="50" ry="50" fill="#e0d0b0" opacity=".3"/>'
            # far wall silhouette
            + '<path d="M0 280H420L480 180H720L780 280H1200V680H0Z" fill="#2a2830"/>'
            + '<path d="M0 380Q250 350 500 375T1000 360T1200 390V680H0Z" fill="#3a3428"/>'
            + '<path d="M0 470Q300 440 600 465T1200 455V680H0Z" fill="#1a1810"/>'
            + glow_ellipse(600, 330, 260, 140)
            # dust plume quiet
            + '<ellipse cx="650" cy="220" rx="80" ry="40" fill="#8a7a60" opacity=".3"/>'
            + '<g filter="url(#prop)">'
            # breach rubble / ramp
            + '<path d="M500 280L560 200 640 210 700 290 680 360 520 350Z" fill="#5a5040" stroke="#12100c" stroke-width="9"/>'
            + '<path d="M540 300L580 250 620 260 650 310" fill="none" stroke="#3a3020" stroke-width="6"/>'
            # siege ladder
            + '<path d="M720 360L780 200" stroke="#2a2010" stroke-width="8" stroke-linecap="round"/>'
            + '<path d="M735 340L790 335M745 310L800 305M755 280L810 275M765 250L820 245" stroke="#2a2010" stroke-width="5"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#100e0a" opacity=".7"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#2a2838"/><stop offset=".4" stop-color="#4a4858"/>'
            '<stop offset=".7" stop-color="#3a3428"/><stop offset="1" stop-color="#1a1810"/>',
            '<stop stop-color="#d4b080" stop-opacity=".45"/><stop offset=".45" stop-color="#8a7050" stop-opacity=".18"/>'
            '<stop offset="1" stop-color="#8a7050" stop-opacity="0"/>',
            glow_cy="44%",
        )
        + sky_rect(w, h)
        + '<ellipse cx="760" cy="110" rx="44" ry="44" fill="#e0d0b0" opacity=".3"/>'
        + '<path d="M0 330H300L350 230H550L600 330H900V800H0Z" fill="#2a2830"/>'
        + '<path d="M0 430Q200 400 450 425T900 410V800H0Z" fill="#3a3428"/>'
        + '<path d="M0 530Q250 500 500 525T900 515V800H0Z" fill="#1a1810"/>'
        + glow_ellipse(450, 390, 220, 120)
        + '<ellipse cx="500" cy="270" rx="70" ry="35" fill="#8a7a60" opacity=".3"/>'
        + '<g filter="url(#prop)">'
        + '<path d="M360 340L410 260 490 270 540 350 520 420 380 410Z" fill="#5a5040" stroke="#12100c" stroke-width="9"/>'
        + '<path d="M400 360L435 310 470 320 500 370" fill="none" stroke="#3a3020" stroke-width="6"/>'
        + '<path d="M560 420L610 260" stroke="#2a2010" stroke-width="8" stroke-linecap="round"/>'
        + '<path d="M575 400L625 395M585 370L635 365M595 340L645 335M605 310L655 305" stroke="#2a2010" stroke-width="5"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#100e0a" opacity=".7"/>'
    )
    return wrap(w, h, body)


def gatehouse(land: bool) -> str:
    """Portcullis maw, murder-hole shadow, flanking braziers."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#1a1520"/><stop offset=".4" stop-color="#2a2838"/>'
                '<stop offset=".7" stop-color="#1e2228"/><stop offset="1" stop-color="#121418"/>',
                '<stop stop-color="#ff9a3c" stop-opacity=".6"/><stop offset=".4" stop-color="#e86020" stop-opacity=".22"/>'
                '<stop offset="1" stop-color="#e86020" stop-opacity="0"/>',
                glow_cy="45%", glow_r="36%",
            )
            + sky_rect(w, h)
            # gate towers silhouette
            + '<path d="M0 300H380V180H440V300H760V180H820V300H1200V680H0Z" fill="#1a1c24"/>'
            + '<path d="M0 380Q250 350 500 375T1000 360T1200 390V680H0Z" fill="#222830"/>'
            + '<path d="M0 470Q300 440 600 465T1200 455V680H0Z" fill="#121418"/>'
            + glow_ellipse(600, 340, 200, 150)
            + '<g filter="url(#prop)">'
            # portcullis arch
            + '<path d="M480 300V420H720V300Q600 220 480 300Z" fill="#0a0c10" stroke="#101418" stroke-width="10"/>'
            + '<path d="M510 300V400M555 295V400M600 290V400M645 295V400M690 300V400" stroke="#2a3038" stroke-width="5"/>'
            + '<path d="M500 340H700M500 370H700" stroke="#2a3038" stroke-width="4"/>'
            # braziers
            + '<path d="M400 340L420 300 440 340Z" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
            + '<path d="M760 340L780 300 800 340Z" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
            + '<ellipse cx="420" cy="300" rx="22" ry="28" fill="#ffd060" opacity=".7"/>'
            + '<ellipse cx="780" cy="300" rx="22" ry="28" fill="#ffd060" opacity=".7"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#0a0c10" opacity=".75"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#1a1520"/><stop offset=".4" stop-color="#2a2838"/>'
            '<stop offset=".7" stop-color="#1e2228"/><stop offset="1" stop-color="#121418"/>',
            '<stop stop-color="#ff9a3c" stop-opacity=".6"/><stop offset=".4" stop-color="#e86020" stop-opacity=".22"/>'
            '<stop offset="1" stop-color="#e86020" stop-opacity="0"/>',
            glow_cy="46%",
        )
        + sky_rect(w, h)
        + '<path d="M0 350H260V230H320V350H580V230H640V350H900V800H0Z" fill="#1a1c24"/>'
        + '<path d="M0 430Q200 400 450 425T900 410V800H0Z" fill="#222830"/>'
        + '<path d="M0 530Q250 500 500 525T900 515V800H0Z" fill="#121418"/>'
        + glow_ellipse(450, 400, 170, 130)
        + '<g filter="url(#prop)">'
        + '<path d="M340 350V470H560V350Q450 275 340 350Z" fill="#0a0c10" stroke="#101418" stroke-width="10"/>'
        + '<path d="M370 350V450M405 345V450M450 340V450M495 345V450M530 350V450" stroke="#2a3038" stroke-width="5"/>'
        + '<path d="M360 390H540M360 420H540" stroke="#2a3038" stroke-width="4"/>'
        + '<path d="M280 400L298 360 316 400Z" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
        + '<path d="M584 400L602 360 620 400Z" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
        + '<ellipse cx="298" cy="360" rx="18" ry="24" fill="#ffd060" opacity=".7"/>'
        + '<ellipse cx="602" cy="360" rx="18" ry="24" fill="#ffd060" opacity=".7"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#0a0c10" opacity=".75"/>'
    )
    return wrap(w, h, body)


def keep_hall(land: bool) -> str:
    """Banner hall, pillar colonnade, clerestory light shafts."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#1a2030"/><stop offset=".4" stop-color="#2a3448"/>'
                '<stop offset=".7" stop-color="#222830"/><stop offset="1" stop-color="#14181e"/>',
                '<stop stop-color="#ffe8c0" stop-opacity=".5"/><stop offset=".4" stop-color="#d4b080" stop-opacity=".2"/>'
                '<stop offset="1" stop-color="#d4b080" stop-opacity="0"/>',
                glow_cy="35%", glow_r="45%",
            )
            + sky_rect(w, h)
            # clerestory shafts (sky band)
            + '<path d="M400 0L460 280 500 280 440 0Z" fill="#ffe8c0" opacity=".12"/>'
            + '<path d="M560 0L620 280 660 280 600 0Z" fill="#ffe8c0" opacity=".15"/>'
            + '<path d="M720 0L780 280 820 280 760 0Z" fill="#ffe8c0" opacity=".12"/>'
            + '<path d="M0 300H1200V680H0Z" fill="#1e2430"/>'
            + '<path d="M0 400Q250 370 500 395T1000 380T1200 410V680H0Z" fill="#282e38"/>'
            + '<path d="M0 480Q300 450 600 475T1200 465V680H0Z" fill="#14181e"/>'
            + glow_ellipse(600, 300, 320, 160)
            + '<g filter="url(#prop)">'
            # pillars
            + '<rect x="420" y="200" width="36" height="220" rx="4" fill="#3a4458" stroke="#101418" stroke-width="8"/>'
            + '<rect x="570" y="190" width="40" height="240" rx="4" fill="#404858" stroke="#101418" stroke-width="8"/>'
            + '<rect x="740" y="200" width="36" height="220" rx="4" fill="#3a4458" stroke="#101418" stroke-width="8"/>'
            # banners
            + '<path d="M438 220V300L456 285 474 300V220" fill="#c04030" stroke="#1a1010" stroke-width="5"/>'
            + '<path d="M590 210V300L608 285 626 300V210" fill="#3ea6ff" stroke="#101820" stroke-width="5"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#0c1014" opacity=".7"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#1a2030"/><stop offset=".4" stop-color="#2a3448"/>'
            '<stop offset=".7" stop-color="#222830"/><stop offset="1" stop-color="#14181e"/>',
            '<stop stop-color="#ffe8c0" stop-opacity=".5"/><stop offset=".4" stop-color="#d4b080" stop-opacity=".2"/>'
            '<stop offset="1" stop-color="#d4b080" stop-opacity="0"/>',
            glow_cy="38%",
        )
        + sky_rect(w, h)
        + '<path d="M280 0L330 320 365 320 315 0Z" fill="#ffe8c0" opacity=".12"/>'
        + '<path d="M400 0L450 320 485 320 435 0Z" fill="#ffe8c0" opacity=".15"/>'
        + '<path d="M520 0L570 320 605 320 555 0Z" fill="#ffe8c0" opacity=".12"/>'
        + '<path d="M0 350H900V800H0Z" fill="#1e2430"/>'
        + '<path d="M0 440Q200 410 450 435T900 420V800H0Z" fill="#282e38"/>'
        + '<path d="M0 540Q250 510 500 535T900 525V800H0Z" fill="#14181e"/>'
        + glow_ellipse(450, 360, 260, 140)
        + '<g filter="url(#prop)">'
        + '<rect x="300" y="250" width="32" height="200" rx="4" fill="#3a4458" stroke="#101418" stroke-width="8"/>'
        + '<rect x="420" y="240" width="36" height="220" rx="4" fill="#404858" stroke="#101418" stroke-width="8"/>'
        + '<rect x="560" y="250" width="32" height="200" rx="4" fill="#3a4458" stroke="#101418" stroke-width="8"/>'
        + '<path d="M316 270V345L332 332 348 345V270" fill="#c04030" stroke="#1a1010" stroke-width="5"/>'
        + '<path d="M438 260V345L454 332 470 345V260" fill="#3ea6ff" stroke="#101820" stroke-width="5"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#0c1014" opacity=".7"/>'
    )
    return wrap(w, h, body)


def umbral_vault(land: bool) -> str:
    """Void-cracked undercroft, floating rubble, violet rift glow."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#0a0814"/><stop offset=".4" stop-color="#181028"/>'
                '<stop offset=".7" stop-color="#14101e"/><stop offset="1" stop-color="#0c0a12"/>',
                '<stop stop-color="#a060ff" stop-opacity=".65"/><stop offset=".4" stop-color="#6030c0" stop-opacity=".28"/>'
                '<stop offset="1" stop-color="#6030c0" stop-opacity="0"/>',
                glow_cy="42%", glow_r="38%",
            )
            + sky_rect(w, h)
            # cracked ceiling / vault ribs
            + '<path d="M0 200Q300 280 600 200T1200 220V680H0Z" fill="#12101c"/>'
            + '<path d="M0 360Q250 330 500 355T1000 340T1200 370V680H0Z" fill="#1a1428"/>'
            + '<path d="M0 460Q300 430 600 455T1200 445V680H0Z" fill="#0c0a12"/>'
            + glow_ellipse(600, 310, 220, 160)
            # floating rubble (quiet mid)
            + '<rect x="350" y="240" width="40" height="22" rx="3" fill="#2a2438" opacity=".7" transform="rotate(-12 370 251)"/>'
            + '<rect x="780" y="260" width="36" height="18" rx="3" fill="#2a2438" opacity=".6" transform="rotate(8 798 269)"/>'
            + '<g filter="url(#prop)">'
            # rift crack
            + '<path d="M560 200L580 280 620 300 640 400" fill="none" stroke="#c080ff" stroke-width="10" stroke-linecap="round" opacity=".85"/>'
            + '<path d="M580 250L600 320 630 340" fill="none" stroke="#e0c0ff" stroke-width="5" opacity=".7"/>'
            + '<ellipse cx="600" cy="300" rx="50" ry="70" fill="#8030e0" opacity=".35"/>'
            + '<rect x="520" y="340" width="50" height="28" rx="4" fill="#3a3048" stroke="#101018" stroke-width="7" transform="rotate(-18 545 354)"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#08060c" opacity=".8"/>'
            + '<ellipse cx="600" cy="300" rx="90" ry="100" fill="#a060ff" opacity=".15"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#0a0814"/><stop offset=".4" stop-color="#181028"/>'
            '<stop offset=".7" stop-color="#14101e"/><stop offset="1" stop-color="#0c0a12"/>',
            '<stop stop-color="#a060ff" stop-opacity=".65"/><stop offset=".4" stop-color="#6030c0" stop-opacity=".28"/>'
            '<stop offset="1" stop-color="#6030c0" stop-opacity="0"/>',
            glow_cy="44%",
        )
        + sky_rect(w, h)
        + '<path d="M0 240Q220 320 450 240T900 260V800H0Z" fill="#12101c"/>'
        + '<path d="M0 400Q200 370 450 395T900 380V800H0Z" fill="#1a1428"/>'
        + '<path d="M0 520Q250 490 500 515T900 505V800H0Z" fill="#0c0a12"/>'
        + glow_ellipse(450, 370, 180, 140)
        + '<rect x="250" y="290" width="34" height="18" rx="3" fill="#2a2438" opacity=".7" transform="rotate(-12 267 299)"/>'
        + '<rect x="600" y="310" width="30" height="16" rx="3" fill="#2a2438" opacity=".6" transform="rotate(8 615 318)"/>'
        + '<g filter="url(#prop)">'
        + '<path d="M410 250L430 330 465 350 485 450" fill="none" stroke="#c080ff" stroke-width="10" stroke-linecap="round" opacity=".85"/>'
        + '<path d="M430 300L450 370 475 390" fill="none" stroke="#e0c0ff" stroke-width="5" opacity=".7"/>'
        + '<ellipse cx="450" cy="360" rx="42" ry="60" fill="#8030e0" opacity=".35"/>'
        + '<rect x="380" y="400" width="44" height="24" rx="4" fill="#3a3048" stroke="#101018" stroke-width="7" transform="rotate(-18 402 412)"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#08060c" opacity=".8"/>'
        + '<ellipse cx="450" cy="360" rx="75" ry="85" fill="#a060ff" opacity=".15"/>'
    )
    return wrap(w, h, body)


def throne_siegelord(land: bool) -> str:
    """Throne dais, chain-hung braziers, eclipse window."""
    if land:
        w, h = 1200, 680
        body = (
            defs(
                '<stop stop-color="#120818"/><stop offset=".35" stop-color="#2a1830"/>'
                '<stop offset=".65" stop-color="#1e1424"/><stop offset="1" stop-color="#100c14"/>',
                '<stop stop-color="#ff9a3c" stop-opacity=".55"/><stop offset=".35" stop-color="#c04080" stop-opacity=".22"/>'
                '<stop offset="1" stop-color="#c04080" stop-opacity="0"/>',
                glow_cy="40%", glow_r="40%",
            )
            + sky_rect(w, h)
            # eclipse window
            + '<circle cx="600" cy="140" r="70" fill="#3a2048" opacity=".6"/>'
            + '<circle cx="620" cy="125" r="70" fill="#120818"/>'
            + '<path d="M0 280H1200V680H0Z" fill="#1a1220"/>'
            + '<path d="M0 380Q250 350 500 375T1000 360T1200 390V680H0Z" fill="#241828"/>'
            + '<path d="M0 470Q300 440 600 465T1200 455V680H0Z" fill="#100c14"/>'
            + glow_ellipse(600, 320, 240, 150)
            + '<g filter="url(#prop)">'
            # throne dais steps
            + '<path d="M460 360H740V400H460Z" fill="#3a2848" stroke="#100818" stroke-width="8"/>'
            + '<path d="M490 320H710V360H490Z" fill="#4a3458" stroke="#100818" stroke-width="8"/>'
            # throne back
            + '<path d="M540 220V320H660V220Q600 170 540 220Z" fill="#5a4068" stroke="#100818" stroke-width="9"/>'
            + '<path d="M560 250H640" stroke="#ff9a3c" stroke-width="5" opacity=".7"/>'
            # chain braziers
            + '<path d="M400 200V300" stroke="#4a4050" stroke-width="4"/>'
            + '<path d="M800 200V300" stroke="#4a4050" stroke-width="4"/>'
            + '<ellipse cx="400" cy="310" rx="28" ry="20" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
            + '<ellipse cx="800" cy="310" rx="28" ry="20" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
            + "</g>"
            + '<path d="M0 555Q400 535 800 550T1200 540V680H0Z" fill="#08060a" opacity=".8"/>'
            + '<ellipse cx="400" cy="290" rx="18" ry="24" fill="#ffd060" opacity=".5"/>'
            + '<ellipse cx="800" cy="290" rx="18" ry="24" fill="#ffd060" opacity=".5"/>'
        )
        return wrap(w, h, body)
    w, h = 900, 800
    body = (
        defs(
            '<stop stop-color="#120818"/><stop offset=".35" stop-color="#2a1830"/>'
            '<stop offset=".65" stop-color="#1e1424"/><stop offset="1" stop-color="#100c14"/>',
            '<stop stop-color="#ff9a3c" stop-opacity=".55"/><stop offset=".35" stop-color="#c04080" stop-opacity=".22"/>'
            '<stop offset="1" stop-color="#c04080" stop-opacity="0"/>',
            glow_cy="42%",
        )
        + sky_rect(w, h)
        + '<circle cx="450" cy="160" r="58" fill="#3a2048" opacity=".6"/>'
        + '<circle cx="468" cy="148" r="58" fill="#120818"/>'
        + '<path d="M0 330H900V800H0Z" fill="#1a1220"/>'
        + '<path d="M0 430Q200 400 450 425T900 410V800H0Z" fill="#241828"/>'
        + '<path d="M0 530Q250 500 500 525T900 515V800H0Z" fill="#100c14"/>'
        + glow_ellipse(450, 380, 200, 130)
        + '<g filter="url(#prop)">'
        + '<path d="M320 420H580V460H320Z" fill="#3a2848" stroke="#100818" stroke-width="8"/>'
        + '<path d="M350 380H550V420H350Z" fill="#4a3458" stroke="#100818" stroke-width="8"/>'
        + '<path d="M390 280V380H510V280Q450 230 390 280Z" fill="#5a4068" stroke="#100818" stroke-width="9"/>'
        + '<path d="M410 310H490" stroke="#ff9a3c" stroke-width="5" opacity=".7"/>'
        + '<path d="M260 250V360" stroke="#4a4050" stroke-width="4"/>'
        + '<path d="M640 250V360" stroke="#4a4050" stroke-width="4"/>'
        + '<ellipse cx="260" cy="370" rx="24" ry="18" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
        + '<ellipse cx="640" cy="370" rx="24" ry="18" fill="#ff9a3c" stroke="#2a1810" stroke-width="7"/>'
        + "</g>"
        + '<path d="M0 680Q300 660 600 675T900 665V800H0Z" fill="#08060a" opacity=".8"/>'
        + '<ellipse cx="260" cy="350" rx="15" ry="20" fill="#ffd060" opacity=".5"/>'
        + '<ellipse cx="640" cy="350" rx="15" ry="20" fill="#ffd060" opacity=".5"/>'
    )
    return wrap(w, h, body)


MAPS = {
    "muster-field": muster_field,
    "ash-road": ash_road,
    "tourney-yard": tourney_yard,
    "moat-crossing": moat_crossing,
    "rampart-breach": rampart_breach,
    "gatehouse": gatehouse,
    "keep-hall": keep_hall,
    "umbral-vault": umbral_vault,
    "throne-of-the-siegelord": throne_siegelord,
}


def main():
    os.makedirs(ROOT, exist_ok=True)
    for mid, fn in MAPS.items():
        for orient, land in (("landscape", True), ("portrait", False)):
            path = os.path.join(ROOT, f"{mid}-{orient}.svg")
            svg = fn(land)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(svg)
            kb = len(svg.encode("utf-8")) / 1024
            shapes = len(re.findall(r"<(?:path|rect|circle|ellipse|g)\b", svg))
            status = "OK" if kb <= 5.0 and shapes <= 45 else "OVER"
            print(f"{status:4} {mid}-{orient}.svg  {kb:.2f}KB  shapes~{shapes}")


if __name__ == "__main__":
    main()
