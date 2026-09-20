from typing import Final


# German label -> stable value used by the renderer.
DAMAGE_ZONES: Final[dict[str, str]] = {
    "Außenspiegel links": "left_side_mirror",
    "Außenspiegel rechts": "right_side_mirror",
    "Beifahrertür": "front_right_door",
    "Dach": "roof",
    "Fahrertür": "front_left_door",
    "Heckklappe": "tailgate",
    "Kotflügel hinten links": "rear_left_fender",
    "Kotflügel hinten rechts": "rear_right_fender",
    "Kotflügel vorne links": "front_left_fender",
    "Kotflügel vorne rechts": "front_right_fender",
    "Motorhaube": "hood",
    "Schweller links": "left_rocker_panel",
    "Schweller rechts": "right_rocker_panel",
    "Stoßstange hinten": "rear_bumper",
    "Stoßstange hinten links": "rear_left_bumper",
    "Stoßstange hinten rechts": "rear_right_bumper",
    "Stoßstange vorne": "front_bumper",
    "Stoßstange vorne links": "front_left_bumper",
    "Stoßstange vorne rechts": "front_right_bumper",
    "Tür hinten links": "rear_left_door",
    "Tür hinten rechts": "rear_right_door",
    "Windschutzscheibe": "windshield",
}

CASE_KINDS: Final[dict[str, str]] = {
    "Parkschaden": "parking_damage",
    "Auffahrunfall": "rear_end_collision",
    "Hagelschaden": "hail_damage",
    "Steinschlag": "stone_chip",
    "Vandalismus": "vandalism",
    "Wildunfall": "wildlife_collision",
    "Rangierschaden": "maneuvering_damage",
    "Ölwechsel": "oil_change",
    "Inspektion": "inspection",
    "HU/AU": "roadworthiness_inspection",
    "Räder und Reifen": "wheels_and_tires",
    "Bremsen": "brakes",
}

# Common variants found in service notes.
CASE_KIND_ALIASES: Final[dict[str, str]] = {
    "tüv": "roadworthiness_inspection",
    "hauptuntersuchung": "roadworthiness_inspection",
    "abgasuntersuchung": "roadworthiness_inspection",
    "räderwechsel": "wheels_and_tires",
    "reifenwechsel": "wheels_and_tires",
    "bremsbelag": "brakes",
    "bremsscheibe": "brakes",
    "motoröl": "oil_change",
}

DAMAGE_TYPES: Final[dict[str, str]] = {
    "kratzer": "scratch",
    "kratzspur": "scratch",
    "schramme": "scrape",
    "delle": "dent",
    "druckstelle": "dent",
    "gerissen": "crack",
    "riss": "crack",
    "steinschlag": "stone_chip",
    "lackschaden": "paint_damage",
    "verformt": "deformation",
    "deformiert": "deformation",
    "hagel": "hail_dent",
}

DAMAGE_CASE_KINDS: Final[set[str]] = {
    "parking_damage",
    "rear_end_collision",
    "hail_damage",
    "stone_chip",
    "vandalism",
    "wildlife_collision",
    "maneuvering_damage",
}

SERVICE_CASE_KINDS: Final[set[str]] = {
    "oil_change",
    "inspection",
    "roadworthiness_inspection",
    "wheels_and_tires",
    "brakes",
}

ZONE_VALUES: Final[set[str]] = set(DAMAGE_ZONES.values())
CASE_KIND_VALUES: Final[set[str]] = set(CASE_KINDS.values())
DAMAGE_TYPE_VALUES: Final[set[str]] = set(DAMAGE_TYPES.values())
SEVERITY_VALUES: Final[set[str]] = {"minor", "moderate", "severe", "unknown"}
LIFECYCLE_VALUES: Final[set[str]] = {
    "new",
    "in_progress",
    "ready",
    "completed",
    "cancelled",
    "unknown",
}

