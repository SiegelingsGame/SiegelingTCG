package com.sieglings.adventure;

import java.util.Map;

/** Earned on entering Badlands; conditional benefits persist for the rest of this run. */
enum SiegeLandBoon {
    ASHEN_RESOLVE("ashen-resolve", "Ashen Resolve", "🛡️", "At turn start, allies below half HP heal 3 and gain 4 Shield. In Badlands: heal 5 and gain 6 Shield."),
    RISKRUNNER("riskrunner", "Riskrunner", "⚡", "When enemies act first in round 1, gain +2 AP on your turn. In Badlands: +3 AP."),
    DEFIANT_SPOILS("defiant-spoils", "Defiant Spoils", "💎", "Elite and boss victories pay +25% gold. In Badlands, they also grant a bonus item.");

    final String id, name, icon, desc;
    SiegeLandBoon(String id, String name, String icon, String desc) { this.id=id; this.name=name; this.icon=icon; this.desc=desc; }
    static SiegeLandBoon byId(String id) { for (var b : values()) if (b.id.equals(id)) return b; return null; }
    Map<String,Object> toMap() { return Map.of("id",id,"name",name,"icon",icon,"desc",desc); }
}
