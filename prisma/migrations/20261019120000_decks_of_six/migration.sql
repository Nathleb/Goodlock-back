-- Decks go from 7 to 6 characters: drop each deck's 7th slot (position 6).
DELETE FROM "DeckSlot" WHERE "position" >= 6;
