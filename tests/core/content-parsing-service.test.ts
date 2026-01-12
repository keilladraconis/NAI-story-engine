import { describe, it, expect, beforeEach } from 'vitest';
import { ContentParsingService } from '../../src/core/content-parsing-service';
import { FieldID } from '../../src/config/field-definitions';

describe('ContentParsingService', () => {
  let service: ContentParsingService;

  beforeEach(() => {
    service = new ContentParsingService();
  });

  describe('parseListLine', () => {
    it('should parse generic list items (Name: Description)', () => {
      const line = 'The Iron Pact: Militaristic isolationism';
      const result = service.parseListLine(line, FieldID.Factions);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('The Iron Pact');
      expect(result?.description).toBe('Militaristic isolationism');
    });

    it('should strip markdown list markers from generic items', () => {
      const line = '- The Iron Pact: Militaristic isolationism';
      const result = service.parseListLine(line, FieldID.Factions);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('The Iron Pact');
    });

    it('should parse Dramatis Personae items (Name (Gender, Age, Role): Description)', () => {
      const line = 'Kael (Male, 34, Smuggler): To pay off his life debt';
      const result = service.parseListLine(line, FieldID.DramatisPersonae);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Kael');
      expect(result?.description).toBe('To pay off his life debt');
      // The content field should contain the cleaned line
      expect(result?.content).toBe('Kael (Male, 34, Smuggler): To pay off his life debt');
    });

    it('should strip markdown list markers from Dramatis Personae items', () => {
      const line = '* Kael (Male, 34, Smuggler): To pay off his life debt';
      const result = service.parseListLine(line, FieldID.DramatisPersonae);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Kael');
    });

    it('should return null for malformed lines', () => {
      const line = 'Just some random text without a colon';
      const result = service.parseListLine(line, FieldID.Factions);

      expect(result).toBeNull();
    });

    it('should return null for malformed Dramatis Personae lines', () => {
      const line = 'Kael: To pay off his life debt'; // Missing parenthesis part
      const result = service.parseListLine(line, FieldID.DramatisPersonae);

      expect(result).toBeNull();
    });
  });
});
