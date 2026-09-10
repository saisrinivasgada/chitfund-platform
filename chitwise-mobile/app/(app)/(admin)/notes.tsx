import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { C, EmptyState, fmtDateTime } from '../../../components/ui';
import { getTeamNotes, createTeamNote, updateTeamNote, deleteTeamNote } from '../../../services/api';
import { toast } from '../../../components/Toast';

type Visibility = 'PRIVATE' | 'SHARED';

function VisibilityPills({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['PRIVATE', 'SHARED'] as Visibility[]).map((v) => {
        const active = value === v;
        return (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={{
              flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
              backgroundColor: active ? C.navy : C.white,
              borderWidth: 1.5, borderColor: active ? C.navy : C.gray200,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: active ? C.white : C.gray500 }}>
              {v === 'PRIVATE' ? 'Private' : 'Shared with team'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function NoteCard({
  note, onEdit, onDelete,
}: {
  note: any;
  onEdit: (note: any) => void;
  onDelete: (note: any) => void;
}) {
  // The API marks notes the caller authored; anything else is read-only.
  const isOwn = note.own ?? true;
  const shared = note.visibility === 'SHARED';

  return (
    <View
      style={{
        backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: C.gray100, borderLeftWidth: 3,
        borderLeftColor: shared ? '#D97706' : C.gray300,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {shared && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E' }}>SHARED</Text>
          </View>
        )}
        {!isOwn && (
          <View style={{ backgroundColor: C.navy + '12', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.navy }}>
              {note.authorName ?? note.authorRole ?? 'Team'}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 11, color: C.gray400, marginLeft: 'auto' }}>
          {fmtDateTime(note.createdAt)}
        </Text>
      </View>

      <Text style={{ fontSize: 14, color: note.text?.trim() ? C.gray900 : C.gray400, lineHeight: 20 }}>
        {note.text?.trim() ? note.text : 'Empty note'}
      </Text>

      {isOwn && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => onEdit(note)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: C.navy + '12',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(note)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              borderWidth: 1, borderColor: '#FECACA',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function TeamNotesScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('PRIVATE');

  const { data: notes = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['team-notes'],
    queryFn: getTeamNotes,
    staleTime: 30_000,
  });

  function resetComposer() {
    setComposerOpen(false);
    setEditingId(null);
    setText('');
    setVisibility('PRIVATE');
  }

  const createMut = useMutation({
    mutationFn: () => createTeamNote({ text: text.trim(), visibility }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-notes'] });
      toast.created('Note added');
      resetComposer();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to add note'),
  });

  const updateMut = useMutation({
    mutationFn: () => updateTeamNote(editingId!, { text: text.trim(), visibility }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-notes'] });
      toast.saved('Note updated');
      resetComposer();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to update note'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTeamNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-notes'] });
      toast.deleted('Note deleted');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to delete note'),
  });

  function startEdit(note: any) {
    setEditingId(note.id);
    setText(note.text ?? '');
    setVisibility(note.visibility === 'SHARED' ? 'SHARED' : 'PRIVATE');
    setComposerOpen(true);
  }

  function confirmDelete(note: any) {
    Alert.alert('Delete Note', 'This note will be removed for everyone it was shared with.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(note.id) },
    ]);
  }

  const saving = createMut.isPending || updateMut.isPending;
  const list = notes as any[];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', padding: 16,
        backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 12, width: 36, height: 36, borderRadius: 10,
            borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>Team Notes</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>Shared notes for your team</Text>
        </View>
        {!composerOpen && (
          <TouchableOpacity
            onPress={() => { resetComposer(); setComposerOpen(true); }}
            style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.navy} />}
        >
          {/* Composer */}
          {composerOpen && (
            <View style={{
              backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 16,
              borderWidth: 1.5, borderColor: C.navy,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray400, marginBottom: 8 }}>
                {editingId ? 'EDIT NOTE' : 'NEW NOTE'}
              </Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Write a note for your team…"
                placeholderTextColor={C.gray400}
                multiline
                autoFocus
                style={{
                  borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.gray900,
                  minHeight: 100, textAlignVertical: 'top', marginBottom: 12,
                }}
              />
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 6 }}>VISIBILITY</Text>
              <VisibilityPills value={visibility} onChange={setVisibility} />
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 6 }}>
                {visibility === 'SHARED'
                  ? 'Visible to all admins and managers in your org.'
                  : 'Only you can see this note.'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={resetComposer}
                  disabled={saving}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1.5, borderColor: C.gray200,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray600 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => (editingId ? updateMut.mutate() : createMut.mutate())}
                  disabled={saving || !text.trim()}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                    backgroundColor: C.navy, opacity: saving || !text.trim() ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Note'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* List */}
          {isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={C.navy} />
            </View>
          ) : list.length === 0 ? (
            <EmptyState title="No notes yet" message="Add a note to share context with your team." />
          ) : (
            list.map((n: any) => (
              <NoteCard key={n.id} note={n} onEdit={startEdit} onDelete={confirmDelete} />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
