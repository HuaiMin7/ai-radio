type TaggedTrack = {
  title?: string;
  artist?: string;
  neteaseKeyword?: string;
  moods?: string[];
  scenes?: string[];
  energy?: number;
  vocal?: boolean;
  language?: string;
  djAngle?: string;
};

type TaggedPlaylist = {
  id?: string;
  name?: string;
  description?: string;
  tracks?: TaggedTrack[];
};

type CountedValue = {
  value: string;
  count: number;
};

export type TasteProfile = {
  sampleRule: string;
  sampleTrackCount: number;
  preferredMoods: CountedValue[];
  preferredScenes: CountedValue[];
  languageMix: CountedValue[];
  vocalRatio: number | null;
  energy: {
    average: number | null;
    distribution: Record<string, number>;
    preferredRange: string | null;
  };
  representativeTracks: Array<{
    title?: string;
    artist?: string;
    moods?: string[];
    scenes?: string[];
    energy?: number;
    language?: string;
    djAngle?: string;
  }>;
  recommendationGuidance: string[];
};

export function buildTasteProfile(playlists: unknown): TasteProfile {
  const tracks = readTaggedPlaylists(playlists).flatMap((playlist) => playlist.tracks ?? []);
  const tracksWithEnergy = tracks.filter((track) => typeof track.energy === "number");
  const vocalTracks = tracks.filter((track) => typeof track.vocal === "boolean");
  const averageEnergy =
    tracksWithEnergy.length > 0
      ? round(
          tracksWithEnergy.reduce((sum, track) => sum + (track.energy ?? 0), 0) /
            tracksWithEnergy.length
        )
      : null;

  return {
    sampleRule:
      "These tracks are taste samples, not a closed music library. Use them to infer the user's preferences, then recommend from broader music knowledge.",
    sampleTrackCount: tracks.length,
    preferredMoods: countValues(tracks.flatMap((track) => track.moods ?? [])).slice(0, 16),
    preferredScenes: countValues(tracks.flatMap((track) => track.scenes ?? [])).slice(0, 16),
    languageMix: countValues(tracks.map((track) => track.language ?? "")).slice(0, 12),
    vocalRatio:
      vocalTracks.length > 0
        ? round(vocalTracks.filter((track) => track.vocal).length / vocalTracks.length)
        : null,
    energy: {
      average: averageEnergy,
      distribution: buildEnergyDistribution(tracksWithEnergy),
      preferredRange: describeEnergyRange(averageEnergy)
    },
    representativeTracks: tracks.slice(0, 36).map((track) => ({
      title: track.title,
      artist: track.artist,
      moods: track.moods,
      scenes: track.scenes,
      energy: track.energy,
      language: track.language,
      djAngle: track.djAngle
    })),
    recommendationGuidance: [
      "Recommend according to the inferred taste profile, current context, and user request.",
      "Recommendations may be outside the seed playlist.",
      "Do not force exact matches from representativeTracks unless they are genuinely best for the moment.",
      "Prefer songs with compatible mood, scene, energy, and texture over merely matching a keyword.",
      "Return clean title and artist names so the playback provider can resolve them."
    ]
  };
}

function readTaggedPlaylists(playlists: unknown): TaggedPlaylist[] {
  if (
    typeof playlists === "object" &&
    playlists !== null &&
    "playlists" in playlists &&
    Array.isArray(playlists.playlists)
  ) {
    return playlists.playlists as TaggedPlaylist[];
  }

  if (Array.isArray(playlists)) {
    return [
      {
        id: "imported-tracks",
        name: "Imported Tracks",
        tracks: playlists as TaggedTrack[]
      }
    ];
  }

  return [];
}

function countValues(values: string[]): CountedValue[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function buildEnergyDistribution(tracks: TaggedTrack[]) {
  const distribution: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0
  };

  for (const track of tracks) {
    const energy = Math.round(track.energy ?? 0);

    if (energy >= 1 && energy <= 5) {
      distribution[String(energy)] += 1;
    }
  }

  return distribution;
}

function describeEnergyRange(averageEnergy: number | null) {
  if (averageEnergy === null) {
    return null;
  }

  if (averageEnergy < 2.4) {
    return "low";
  }

  if (averageEnergy < 3.7) {
    return "medium";
  }

  return "high";
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
