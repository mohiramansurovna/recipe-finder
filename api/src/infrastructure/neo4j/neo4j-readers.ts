import neo4j from 'neo4j-driver';
import type { Record as Neo4jRecord } from 'neo4j-driver';

export function readString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
        throw new Error(`Neo4j returned a recipe without a valid ${field}.`);
    }
    return value;
}

export function readMinutes(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const minutes = neo4j.isInt(value) ? value.toNumber() : value;
    if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 0) {
        throw new Error('Neo4j returned a recipe with an invalid cooking time.');
    }
    return minutes;
}

export function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value) || !value.every(name => typeof name === 'string')) {
        throw new Error('Neo4j returned a value with invalid array.');
    }
    return value;
}

export function readOptionalStrings(value: unknown, field: string): string[] | null {
    if (value === null || value === undefined) return null;
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new Error(`Neo4j returned a recipe with invalid ${field}.`);
    }
    return value;
}

export function readRating(value: unknown, field: string): number {
    const rating = neo4j.isInt(value) ? value.toNumber() : value;
    if (typeof rating !== 'number' || !Number.isFinite(rating) || rating <= 0 || rating > 5) {
        throw new Error(`Neo4j returned a recipe with an invalid ${field}.`);
    }
    return rating;
}

export function readRatings(value: unknown): number[] {
    if (!Array.isArray(value)) {
        throw new Error('Neo4j returned a recipe with invalid individual ratings.');
    }
    return value.map(rating => readRating(rating, 'individual rating'));
}

export function readAggregateRating(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    return readRating(value, 'aggregate rating');
}

export function readTotalCount(record: Neo4jRecord | undefined): number {
    const value: unknown = record?.get('totalCount');
    const count = neo4j.isInt(value) ? value.toNumber() : value;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('Neo4j returned an invalid recipe-search total count.');
    }
    return count;
}
export function toNumber(value: unknown): unknown {
    return neo4j.isInt(value) ? value.toNumber() : value;
}

export function readNonNegativeInt(value: unknown, errorMessage: string): number {
    const n = toNumber(value);
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) throw new Error(errorMessage);
    return n;
}

export function readScore(record: Neo4jRecord, field: string): number {
    const value: unknown = record.get(field);
    const score = neo4j.isInt(value) ? value.toNumber() : value;
    if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0) {
        throw new Error(`Neo4j returned an invalid ${field} recipe-search score.`);
    }
    return score;
}