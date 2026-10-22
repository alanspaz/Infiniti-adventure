import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { selectQuestTab, type QuestTabEntry } from '../../engine';
import { useCampaignState } from '../campaign';
import { Card, Section, kit } from './infoTabKit';

const KIND_LABEL: Record<string, string> = {
  given: 'Given',
  known: 'Known',
  lead: 'Lead',
  done: 'Done',
  failed: 'Failed',
};

function QuestCard({ e }: { e: QuestTabEntry }) {
  const q = e.quest;
  const status = q.status === 'active' ? 'Active' : q.status === 'done' ? 'Done' : 'Failed';
  return (
    <Card muted={q.status !== 'active'}>
      <Text style={kit.title}>{q.title || 'Quest'}</Text>
      <Text style={q.status === 'active' ? kit.badge : kit.badgeMuted}>{status}</Text>
      {e.giver ? <Text style={kit.meta}>From {e.giver}</Text> : null}
      {q.summary ? <Text style={kit.body}>{q.summary}</Text> : null}
      {e.nextLead ? <Text style={kit.body}>Next: {e.nextLead}</Text> : null}
      {e.rewards.length ? (
        <Text style={kit.meta}>
          {q.status === 'done' ? 'Earned' : 'Reward'}: {e.rewards.join(', ')}
        </Text>
      ) : null}
      {e.journal.length ? (
        <View style={kit.notes}>
          {e.journal.map((j, i) => (
            <Text key={`${i}-${j.kind}`} style={kit.note}>
              <Text style={kit.badgeMuted}>{KIND_LABEL[j.kind]} </Text>
              {j.text}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Quest journal (TABS-01) — a pure read of CampaignState through
 * selectQuestTab (quests + the chronicle's per-quest journal; built on
 * partitionQuests). Never crashes on open; an empty list is valid.
 */
export function QuestTab() {
  const { state } = useCampaignState();
  const { active, done, failed } = selectQuestTab(state);
  const total = active.length + done.length + failed.length;

  return (
    <ScrollView style={kit.scroll} contentContainerStyle={kit.root} keyboardShouldPersistTaps="handled">
      <Text style={kit.hint}>{state.title}</Text>
      {total === 0 ? (
        <Card>
          <Text style={kit.emptyTitle}>No quests yet</Text>
          <Text style={kit.emptyBody}>
            Your journal is quiet for now. Objectives will appear here when the adventure gives you
            something to chase.
          </Text>
        </Card>
      ) : (
        <>
          {active.length > 0 ? <Section>Active ({active.length})</Section> : null}
          {active.map((e) => (
            <QuestCard key={e.quest.id} e={e} />
          ))}
          {done.length > 0 ? <Section>Done ({done.length})</Section> : null}
          {done.map((e) => (
            <QuestCard key={e.quest.id} e={e} />
          ))}
          {failed.length > 0 ? <Section>Failed ({failed.length})</Section> : null}
          {failed.map((e) => (
            <QuestCard key={e.quest.id} e={e} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
