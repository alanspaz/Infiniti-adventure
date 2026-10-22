import React from 'react';
import { TAB_COPY } from '../../engine/narration/lineBanks';
import { ScrollView, Text, View } from 'react-native';
import { selectCompanionsTab } from '../../engine';
import { useCampaignState } from '../campaign';
import { Card, Notes, Section, kit } from './infoTabKit';

const ROLE_LABEL = { companion: 'Companion · 1 slot', escort: 'Escort · free', pet: 'Pet · ½ slot' } as const;

function slotsText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Companions (TABS-01) — party slots + people you've met, read from
 * CampaignState via selectCompanionsTab. Never auto-spawns; joining stays
 * parked (C-01), so nothing here adds anyone.
 */
export function CompanionsTab() {
  const { state } = useCampaignState();
  const tab = selectCompanionsTab(state);

  return (
    <ScrollView style={kit.scroll} contentContainerStyle={kit.root} keyboardShouldPersistTaps="handled">
      <Section>
        Party · {slotsText(tab.slotsUsed)}/{tab.slotsTotal} slots
      </Section>
      <Text style={kit.hint}>
        A party is you plus up to {tab.slotsTotal} companions. Escorts don't take a slot; pets take half.
      </Text>
      {tab.members.length === 0 ? (
        <Card>
          <Text style={kit.emptyTitle}>You travel alone</Text>
          <Text style={kit.emptyBody}>
            No companions walk beside you yet. Companions are never added for you.
          </Text>
        </Card>
      ) : (
        tab.members.map(({ member, role }) => (
          <Card key={member.id}>
            <Text style={kit.title}>{member.name}</Text>
            <Text style={kit.meta}>
              {member.className} · Level {member.level} · {ROLE_LABEL[role]}
            </Text>
            {member.description ? <Text style={kit.body}>{member.description}</Text> : null}
          </Card>
        ))
      )}

      <Section>{TAB_COPY.companions.people} ({tab.npcs.length})</Section>
      {tab.npcs.length === 0 ? (
        <Text style={kit.muted}>{TAB_COPY.companions.peopleEmpty}</Text>
      ) : (
        tab.npcs.map((n) => (
          <Card key={n.id}>
            <Text style={kit.title}>{n.name}</Text>
            {n.role ? <Text style={kit.meta}>{n.role}</Text> : null}
            {n.lastSeenName ? <Text style={kit.meta}>{TAB_COPY.companions.lastSeen} {n.lastSeenName}</Text> : null}
            <View>
              <Notes notes={n.notes} />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
