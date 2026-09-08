package com.sieglings.adventure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SiegeLandTest {
    @Autowired SiegeService service;
    @Autowired SiegeContentService content;
    @Autowired SiegeCombatEngine engine;
    @Autowired ObjectMapper json;

    @Test void everyElementHasALandAndLaterRollsIncludeRareAndBadlandsWithoutRepeats() {
        for (Element e : Element.values()) if (e != Element.NEUTRAL)
            assertTrue(SiegeLand.ALL.stream().anyMatch(l -> l.kind().equals("ELEMENTAL") && l.favors(e)), e.name());
        Random rng = new Random(82);
        Set<String> seen = new HashSet<>();
        SiegeLand prior = null;
        for (int i = 0; i < 2500; i++) {
            SiegeLand start = SiegeLand.roll(null, 0, content.defaultPalette(), rng);
            assertEquals("ELEMENTAL", start.kind());
            SiegeLand next = SiegeLand.roll(prior, 2, content.defaultPalette(), rng);
            assertNotSame(prior, next);
            assertTrue(content.defaultPalette().containsAll(next.elements()));
            seen.add(next.kind()); prior = next;
        }
        assertEquals(Set.of("ELEMENTAL","RARE","BADLANDS"), seen);
    }

    @Test void favoredCandidatesHaveFourTicketsWithoutExcludingOtherElements() {
        SieglingCard fire = new SieglingCard(); fire.setElement(Element.FIRE);
        SieglingCard ice = new SieglingCard(); ice.setElement(Element.ICE);
        int[] counts = new int[2]; Random rng = new Random(191);
        for (int i=0;i<10000;i++) counts[SiegeContentService.weightedCardIndex(List.of(fire,ice), SiegeLand.byId("fire"), rng)]++;
        assertTrue(counts[0] > 7700 && counts[0] < 8300, Arrays.toString(counts));
        assertTrue(counts[1] > 0);
        assertEquals(4, SiegeLand.byId("obsidian").weight(Element.EARTH));
        assertEquals(4, SiegeLand.byId("obsidian").weight(Element.FIRE));
    }

    @Test void themingPreservesRoutesAndBossesAndOnlyChangesTheNewSegment() {
        for (SiegeLand land : SiegeLand.ALL) {
            SiegeRun run = new SiegeRun("map"); run.getMap().addAll(content.generateMap(new Random(37)));
            Map<Integer,SiegeNode> old = new HashMap<>(); run.getMap().forEach(n -> old.put(n.getId(),n));
            land.themeMap(run,1,new Random(44));
            for (SiegeNode n : run.getMap()) {
                SiegeNode was=old.get(n.getId());
                assertEquals(was.getNext(),n.getNext()); assertEquals(was.getRow(),n.getRow());
                if (n.getRow()<8 || n.getRow()>=16) assertSame(was,n);
                if (n.getRow()%8==7) assertEquals(NodeType.BOSS,n.getType());
                if (n.getRow()%8==6) assertEquals(NodeType.REST,n.getType());
            }
            assertTrue(run.getMap().stream().anyMatch(n -> n.getRow()==9 && n.getType()==land.feature()));
        }
    }

    @Test void newRunAndBossTransitionKeepLandStableAcrossReadsRetriesAndCheckpoint() throws Exception {
        SiegeRun run = newRun("STANDARD");
        assertNotNull(run.getLand()); assertEquals(1,run.getLandHistory().size());
        String initial = run.getLand().id();
        assertEquals(initial, ((Map<?,?>)service.state(run.getToken()).get("land")).get("id"));
        winBoss(run,0);
        assertEquals(1,run.getBossKills()); assertEquals(2,run.getLandHistory().size());
        assertNotEquals(initial,run.getLand().id());
        String next=run.getLand().id(); long gold=run.getGold();
        service.continueRun(run.getToken(),null);
        assertEquals(next,run.getLand().id()); assertEquals(gold,run.getGold());
        Map<String,Object> snap = snapshot(run);
        SiegeRun restored = restore(run.getToken(),snap);
        assertEquals(next,restored.getLand().id()); assertEquals(run.getLandHistory(),restored.getLandHistory());
        var stable = run.getLand(); run.setLand(SiegeLand.byId(initial));
        run.getLandHistory().removeLast();
        invoke("enterNextLand",new Class<?>[]{SiegeRun.class},run);
        assertEquals(stable,run.getLand(),"Replaying the prior checkpoint cannot reroll the new land");
    }

    @Test void endlessAppendsAndThemesItsFourthLandWhileFixedExpeditionsFinish() throws Exception {
        SiegeRun endless=newRun("ENDLESS"); endless.setBossKills(2);
        winBoss(endless,2);
        assertEquals(3,endless.getBossKills()); assertEquals(RunStatus.ACTIVE,endless.getStatus());
        assertTrue(endless.getMap().stream().anyMatch(n -> n.getRow()==25 && n.getType()==endless.getLand().feature()));
        SiegeRun fixed=newRun("STANDARD"); fixed.setBossKills(2); SiegeLand land=fixed.getLand();
        winBoss(fixed,2);
        assertEquals(RunStatus.WON,fixed.getStatus()); assertEquals(land,fixed.getLand());
    }

    @Test void terrainAffectsOnlyFavoredSiegelingsAndDoesNotStackBetweenBattles() {
        SiegeRun run=new SiegeRun("terrain");
        Combatant fire=unit("fire",Element.FIRE), ice=unit("ice",Element.ICE);
        run.getParty().addAll(List.of(fire,ice)); run.setLand(SiegeLand.byId("fire"));
        engine.startBattle(run,NodeType.BATTLE,List.of(unitEnemy()),new Random(1));
        assertEquals(1,fire.getBaseAttackBuff()); assertEquals(0,ice.getBaseAttackBuff());
        engine.startBattle(run,NodeType.BATTLE,List.of(unitEnemy()),new Random(1));
        assertEquals(1,fire.getBaseAttackBuff());
        run.setLand(SiegeLand.byId("ice"));
        engine.startBattle(run,NodeType.BATTLE,List.of(unitEnemy()),new Random(1));
        assertEquals(0,fire.getBaseAttackBuff()); assertEquals(5,ice.getShield());
        run.setLand(SiegeLand.byId("wind")); fire=unit("wind",Element.WIND); run.getParty().set(0,fire);
        engine.startBattle(run,NodeType.BATTLE,List.of(unitEnemy()),new Random(1));
        assertEquals(fire.leveledBaseSpeed()+2,fire.getSpeed());
    }

    @Test void badlandsBoonsRequireTheirConditionsAndHaveStrongerLocalEffects() {
        SiegeRun run=new SiegeRun("boons"); run.setLand(SiegeLand.byId("badlands"));
        run.getLandBoons().addAll(List.of("ashen-resolve","riskrunner"));
        SiegeBattle battle=new SiegeBattle(NodeType.ELITE); battle.setRoundNumber(1); battle.setPlayerActsFirst(false);
        Combatant wounded=unit("wounded",Element.EARTH),healthy=unit("healthy",Element.ICE);
        wounded.setHp(10); battle.getCombatants().addAll(List.of(wounded,healthy));
        assertEquals(3,SiegeCombatEngine.applyLandBoons(run,battle));
        assertEquals(15,wounded.getHp()); assertEquals(6,wounded.getShield()); assertEquals(0,healthy.getShield());
        battle.setRoundNumber(2); assertEquals(0,SiegeCombatEngine.applyLandBoons(run,battle));
        run.setLand(SiegeLand.byId("earth")); wounded.setHp(10); wounded.setShield(0);
        battle.setRoundNumber(1); assertEquals(2,SiegeCombatEngine.applyLandBoons(run,battle));
        assertEquals(13,wounded.getHp()); assertEquals(4,wounded.getShield());
        battle.setPlayerActsFirst(true); assertEquals(0,SiegeCombatEngine.applyLandBoons(run,battle));
    }

    @Test void badlandsOfferGatesTravelRejectsInvalidPicksAndSurvivesResume() throws Exception {
        SiegeRun run=newRun("STANDARD"); run.setLand(SiegeLand.byId("badlands"));
        run.getLandBoonOffer().addAll(List.of("ashen-resolve","riskrunner","defiant-spoils"));
        assertTrue(run.reachableNodeIds().isEmpty());
        assertThrows(IllegalArgumentException.class,()->service.pickBoon(run.getToken(),"first-round-ap"));
        SiegeRun restored=restore(run.getToken(),snapshot(run));
        assertEquals(run.getLandBoonOffer(),restored.getLandBoonOffer()); assertTrue(restored.reachableNodeIds().isEmpty());
        service.pickBoon(run.getToken(),"riskrunner");
        assertEquals(List.of("riskrunner"),run.getLandBoons()); assertFalse(run.reachableNodeIds().isEmpty());
        assertThrows(IllegalArgumentException.class,()->service.pickBoon(run.getToken(),"riskrunner"));
        assertEquals(run.getLandBoons(),restore(run.getToken(),snapshot(run)).getLandBoons());
    }

    @Test void relicLandPaysMoreGoldAndOffersAnItemAlongsideNormalRewards() throws Exception {
        SiegeRun run=newRun("STANDARD"); run.setLand(SiegeLand.byId("relic")); run.setKnightPassive(KnightPassive.SHIELD);
        assertEquals(30,invoke("earnGold",new Class<?>[]{SiegeRun.class,int.class},run,20));
        invoke("generateRewards",new Class<?>[]{SiegeRun.class,boolean.class},run,false);
        assertTrue(run.getPendingRewards().stream().anyMatch(r->"ITEM".equals(r.kind())));
    }

    @Test void landEventsVaryAndCanBeResolvedThroughTheExistingChoiceEngine() throws Exception {
        assertEquals(SiegeLand.ALL.size(),SiegeLand.ALL.stream().map(l->l.event().title()).distinct().count());
        SiegeRun run=newRun("STANDARD"); run.setLand(SiegeLand.byId("earth"));
        for(int i=0;i<15;i++) {
            invoke("openEvent",new Class<?>[]{SiegeRun.class},run);
            if(run.getEventTitle().equals(run.getLand().eventTitle())) break;
        }
        assertEquals(run.getLand().eventTitle(),run.getEventTitle());
        for(var ally:run.getParty()) ally.setHp(10);
        service.eventChoose(run.getToken(),"e0");
        assertFalse(run.isInEvent()); assertTrue(run.getParty().stream().allMatch(a->a.getHp()>=26));
    }

    @Test void oldSnapshotsMigrateWithoutRewritingTheMapAndFixturesUseServerSerialization() throws Exception {
        SiegeRun run=newRun("STANDARD"); Map<String,Object> snap=snapshot(run);
        snap.remove("landId");snap.remove("landHistory");snap.remove("landBoons");snap.remove("landBoonOffer");
        SiegeRun migrated=restore(run.getToken(),snap);
        assertNotNull(migrated.getLand()); assertEquals(snapshot(migrated).get("map"),snap.get("map"));
        Path out=Path.of("output/lands");Files.createDirectories(out);
        json.writerWithDefaultPrettyPrinter().writeValue(out.resolve("catalog.json").toFile(),SiegeLand.ALL.stream().map(SiegeLand::toMap).toList());
        run.getMap().clear(); run.getMap().addAll(content.generateMap(new Random(28)));
        run.setLand(SiegeLand.byId("fire")); run.getLand().themeMap(run,0,new Random(16));
        json.writerWithDefaultPrettyPrinter().writeValue(out.resolve("map-fixture.json").toFile(),service.state(run.getToken()));
    }

    private SiegeRun newRun(String mode) throws Exception {
        var knight=SiegeStarterTestSupport.starterKnight(content);
        var ids=SiegeStarterTestSupport.starterIds(content,knight,content.selectableSieglings().getFirst());
        var response=service.newRun(null,knight.getId(),ids,mode);
        return (SiegeRun)invoke("require",new Class<?>[]{String.class},response.get("token"));
    }
    private void winBoss(SiegeRun run,int segment) {
        SiegeNode boss=run.getMap().stream().filter(n->n.getRow()==segment*8+7).findFirst().orElseThrow();
        run.setCurrentNodeId(boss.getId()); run.getPendingRewards().clear();run.setPendingRecruit(null);run.getLandBoonOffer().clear();
        SiegeBattle battle=new SiegeBattle(NodeType.BOSS);battle.setPhase(BattlePhase.WON);battle.getCombatants().add(unitEnemy());run.setBattle(battle);
        service.continueRun(run.getToken(),null);
    }
    @SuppressWarnings("unchecked") private Map<String,Object> snapshot(SiegeRun run) throws Exception { return (Map<String,Object>)invoke("snapshotRun",new Class<?>[]{SiegeRun.class},run); }
    @SuppressWarnings("unchecked") private SiegeRun restore(String token,Map<String,Object> snap) throws Exception { return ((Optional<SiegeRun>)invoke("restoreRun",new Class<?>[]{String.class,Map.class},token,snap)).orElseThrow(); }
    private Object invoke(String name,Class<?>[] types,Object...args) throws Exception { Method m=SiegeService.class.getDeclaredMethod(name,types);m.setAccessible(true);return m.invoke(service,args); }
    private Combatant unit(String id,Element e) {return new Combatant(id,id,e,Side.PLAYER,40,40,null);}
    private Combatant unitEnemy() {return new Combatant("foe","Foe",Element.METAL,Side.ENEMY,80,1,null);}
}
