import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createCampaignFromIdentity,
  loadPlaystylePack,
  type CampaignSave,
  type OriginMode,
  type PlaystylePack,
} from '../../engine';
import { theme } from '../theme';

type Props = {
  packId: string;
  onBack: () => void;
  onCreated: (campaign: CampaignSave) => void;
};

export function IdentityScreen({ packId, onBack, onCreated }: Props) {
  const pack: PlaystylePack = useMemo(
    () => loadPlaystylePack(packId),
    [packId],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [className, setClassName] = useState(pack.classes[0]?.name ?? '');
  const [customClass, setCustomClass] = useState(false);
  const [ageText, setAgeText] = useState('');
  const [originMode, setOriginMode] = useState<OriginMode>('backstory');
  const [error, setError] = useState<string | null>(null);

  const selectListedClass = (listed: string) => {
    setCustomClass(false);
    setClassName(listed);
  };

  const parseAge = (): number | null => {
    const t = ageText.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('Age must be a non-negative number of years');
    }
    return Math.floor(n);
  };

  const onSubmit = () => {
    try {
      setError(null);
      const age = parseAge();
      const resolvedClass = className.trim();
      const campaign = createCampaignFromIdentity({
        name,
        description,
        className: resolvedClass,
        age,
        originMode,
        playstylePackId: packId,
      });
      onCreated(campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.title}>Identity</Text>
        <Text style={styles.packLine}>
          Pack: {pack.displayName}
        </Text>
        <Text style={styles.hint}>
          Solo by default — your character is the only party member. Companions
          are never spawned automatically.
        </Text>

        <Text style={styles.section}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What are you called?"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />

        <Text style={styles.section}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={
            originMode === 'memory-loss'
              ? 'What little you know or feel…'
              : 'Look, vibe, known backstory…'
          }
          placeholderTextColor={theme.colors.textMuted}
          multiline
          style={[styles.input, styles.multiline]}
        />

        <Text style={styles.section}>Class</Text>
        <View style={styles.row}>
          {pack.classes.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => selectListedClass(c.name)}
              style={[
                styles.chip,
                !customClass && className === c.name && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  !customClass &&
                    className === c.name &&
                    styles.chipLabelActive,
                ]}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
          {pack.allowCustomClasses ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCustomClass(true);
                if (pack.classes.some((c) => c.name === className)) {
                  setClassName('');
                }
              }}
              style={[styles.chip, customClass && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  customClass && styles.chipLabelActive,
                ]}
              >
                Custom
              </Text>
            </Pressable>
          ) : null}
        </View>
        {customClass ? (
          <TextInput
            value={className}
            onChangeText={setClassName}
            placeholder="Custom class name"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.classInput]}
          />
        ) : (
          <Text style={styles.classSummary}>
            {pack.classes.find((c) => c.name === className)?.summary ?? ''}
          </Text>
        )}

        <Text style={styles.section}>Age (years)</Text>
        <TextInput
          value={ageText}
          onChangeText={setAgeText}
          placeholder="Optional"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.section}>Origin</Text>
        <View style={styles.row}>
          {(
            [
              ['backstory', 'Backstory'],
              ['memory-loss', 'Memory loss'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setOriginMode(value)}
              style={[
                styles.chip,
                originMode === value && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  originMode === value && styles.chipLabelActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          {originMode === 'memory-loss'
            ? 'Name, class, and age still apply. A sealed backstory seed is generated on-device at create — not revealed here.'
            : 'Your description is known backstory. No sealed seed is stored.'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={({ pressed }) => [styles.save, pressed && styles.pressed]}
        >
          <Text style={styles.saveLabel}>Begin campaign</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  scroll: {
    paddingBottom: theme.spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: theme.spacing.xs,
  },
  packLine: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: theme.colors.accent,
  },
  chipLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  chipLabelActive: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: theme.spacing.sm,
  },
  classSummary: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: theme.spacing.sm,
  },
  classInput: {
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  error: {
    color: theme.colors.danger,
    marginTop: theme.spacing.md,
    fontSize: 14,
  },
  save: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  saveLabel: {
    color: theme.colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
