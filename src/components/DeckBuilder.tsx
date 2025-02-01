import { useState } from "react";
import { motion } from "motion/react"
import { Save, Trash2 } from "lucide-react";

export default function DeckBuilder({
                                        deckName,
                                        setDeckName,
                                        deckFormat,
                                        setDeckFormat,
                                        selectedCards,
                                        updateCardQuantity,
                                        removeCardFromDeck,
                                        saveDeck,
                                        validation,
                                        initialDeck,
                                    }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            {/* Bouton d'ouverture du menu */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-lg md:hidden"
            >
                Open Deck Builder
            </button>

            {/* Menu latéral */}
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: isOpen ? "0%" : "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed top-0 right-0 w-4/5 h-full bg-gray-800 p-6 shadow-lg md:static md:w-full md:h-auto md:p-6 md:shadow-none z-50"
            >
                {/* Bouton de fermeture */}
                <button
                    onClick={() => setIsOpen(false)}
                    className="absolute top-4 right-4 text-white"
                >
                    ✖
                </button>

                <div className="space-y-4">
                    <input
                        type="text"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                        placeholder="Deck Name"
                    />

                    <select
                        value={deckFormat}
                        onChange={(e) => setDeckFormat(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                    >
                        <option value="standard">Standard</option>
                        <option value="modern">Modern</option>
                        <option value="commander">Commander</option>
                        <option value="legacy">Legacy</option>
                        <option value="vintage">Vintage</option>
                        <option value="pauper">Pauper</option>
                    </select>

                    {!validation.isValid && (
                        <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
                            <ul className="list-disc list-inside text-red-400 text-sm">
                                {validation.errors.map((error, index) => (
                                    <li key={index}>{error}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="space-y-2">
                        <h3 className="font-bold text-xl mb-4">
                            Cards ({selectedCards.reduce((acc, curr) => acc + curr.quantity, 0)})
                        </h3>
                        {selectedCards.map(({ card, quantity }) => (
                            <div key={card.id} className="flex items-center gap-4 bg-gray-700 p-2 rounded-lg">
                                <img
                                    src={card.image_uris?.art_crop}
                                    alt={card.name}
                                    className="w-12 h-12 rounded"
                                />
                                <div className="flex-1">
                                    <h4 className="font-medium">{card.name}</h4>
                                </div>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => updateCardQuantity(card.id, parseInt(e.target.value))}
                                    min="1"
                                    max="4"
                                    className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-center"
                                />
                                <button
                                    onClick={() => removeCardFromDeck(card.id)}
                                    className="text-red-500 hover:text-red-400"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={saveDeck}
                        disabled={!deckName.trim() || selectedCards.length === 0 || !validation.isValid}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2"
                    >
                        <Save size={20} />
                        {initialDeck ? "Update Deck" : "Save Deck"}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
