// src/__tests__/subtitles.test.ts
import { describe, it, expect } from 'vitest';
import { parseSrt, findSubtitleIndex, formatTimeLabel } from '../libs/subtitles';

describe('Subtitle Module', () => {
    describe('parseSrt', () => {
        it('should correctly parse valid SRT content', () => {
            const srtContent = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:05,000 --> 00:00:08,000
Second Line`;

            const result = parseSrt(srtContent);

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                start: 1,
                end: 4,
                text: 'Hello World',
            });
            expect(result[1].text).toBe('Second Line');
        });

        it('should preserve HTML tags in subtitles', () => {
            const srtContent = `1
00:00:01,000 --> 00:00:04,000
<i>Italic</i> and <b>Bold</b>`;

            const result = parseSrt(srtContent);
            // Note: React version keeps HTML tags; rendering handles display
            expect(result[0].text).toContain('Italic');
            expect(result[0].text).toContain('Bold');
        });

        it('should return empty array for empty input', () => {
            expect(parseSrt('')).toEqual([]);
        });

        it('should handle multiline subtitles', () => {
            const srtContent = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`;

            const result = parseSrt(srtContent);
            expect(result[0].text).toBe('Line one\nLine two');
        });

        it('should handle malformed time codes gracefully', () => {
            const srtContent = `1
invalid time --> 00:00:04,000
This should be skipped

2
00:00:05,000 --> 00:00:08,000
Valid subtitle`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(1);
            expect(result[0].text).toBe('Valid subtitle');
        });

        it('should handle dots instead of commas in time codes', () => {
            const srtContent = `1
00:00:01.000 --> 00:00:04.000
Dot notation`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(1);
            expect(result[0].start).toBe(1);
            expect(result[0].end).toBe(4);
        });

        it('should handle missing subtitle index numbers', () => {
            const srtContent = `00:00:01,000 --> 00:00:04,000
No index number`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(1);
            expect(result[0].text).toBe('No index number');
        });

        it('should handle extra blank lines', () => {
            const srtContent = `

1
00:00:01,000 --> 00:00:04,000
First


2
00:00:05,000 --> 00:00:08,000
Second

`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(2);
            expect(result[0].text).toBe('First');
            expect(result[1].text).toBe('Second');
        });

        it('should handle Windows line endings (CRLF)', () => {
            const srtContent = `1\r\n00:00:01,000 --> 00:00:04,000\r\nWindows format`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(1);
            expect(result[0].text).toBe('Windows format');
        });

        it('should handle very short durations', () => {
            const srtContent = `1
00:00:00,100 --> 00:00:00,200
Quick flash`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(1);
            expect(result[0].start).toBe(0.1);
            expect(result[0].end).toBe(0.2);
        });

        it('should handle long hours', () => {
            const srtContent = `1
02:30:15,500 --> 02:30:20,000
Long movie`;

            const result = parseSrt(srtContent);
            expect(result).toHaveLength(1);
            expect(result[0].start).toBe(2 * 3600 + 30 * 60 + 15.5);
            expect(result[0].end).toBe(2 * 3600 + 30 * 60 + 20);
        });
    });

    describe('findSubtitleIndex', () => {
        const subtitles = [
            { start: 0, end: 5, text: 'a' },
            { start: 5, end: 10, text: 'b' },
            { start: 10, end: 15, text: 'c' }
        ];

        it('should find correct index for a given time', () => {
            expect(findSubtitleIndex(subtitles, 2, -1)).toBe(0);
            expect(findSubtitleIndex(subtitles, 7, -1)).toBe(1);
            expect(findSubtitleIndex(subtitles, 12, -1)).toBe(2);
        });

        it('should return -1 if time is not within any subtitle', () => {
            expect(findSubtitleIndex(subtitles, 20, -1)).toBe(-1);
        });

        it('should optimize for sequential access', () => {
            expect(findSubtitleIndex(subtitles, 7, 0)).toBe(1);
        });
    });

    describe('formatTimeLabel', () => {
        it('should format time correctly', () => {
            expect(formatTimeLabel(90)).toBe('1:30'); // 90 seconds = 1:30
            expect(formatTimeLabel(605)).toBe('10:05'); // 605 seconds = 10:05
        });

        it('should handle zero', () => {
            expect(formatTimeLabel(0)).toBe('0:00');
        });

        it('should handle large values', () => {
            expect(formatTimeLabel(3661)).toBe('61:01'); // 61 minutes 1 second
        });
    });
});
