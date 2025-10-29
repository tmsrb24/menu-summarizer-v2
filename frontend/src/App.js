import React, { useState, useMemo } from 'react';

function App() {
  const [url, setUrl] = useState('');
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [allergenFilter, setAllergenFilter] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMenuData(null);
    setAllergenFilter([]);

    try {
      const response = await fetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details || 'Došlo k chybě.');
      setMenuData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uniqueAllergens = useMemo(() => {
    if (!menuData?.menu_items) return [];
    const all = menuData.menu_items.flatMap(item => item.allergens || []);
    return [...new Set(all)].sort((a, b) => a - b);
  }, [menuData]);

  const filteredMenuItems = useMemo(() => {
    if (allergenFilter.length === 0) return menuData?.menu_items || [];
    return menuData.menu_items.filter(item => 
      !allergenFilter.some(filter => item.allergens?.includes(filter))
    );
  }, [menuData, allergenFilter]);

  const handleAllergenToggle = (allergen) => {
    setAllergenFilter(prev => 
      prev.includes(allergen) 
        ? prev.filter(a => a !== allergen) 
        : [...prev, allergen]
    );
  };

  return (
    <div className="text-white min-h-screen font-sans">
      <div className="container mx-auto p-4 sm:p-8">
        <header className="text-center mb-8 sm:mb-12">
          <h1 className="text-4xl sm:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Menu Summarizer
          </h1>
          <p className="text-gray-400 mt-2 text-lg">Vložte URL a nechte si zobrazit denní menu v moderním kabátě.</p>
        </header>

        <main>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto mb-8">
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-grow p-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" required />
            <button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50">
              {loading ? 'Analyzuji...' : 'Analyzovat'}
            </button>
          </form>

          {loading && <div className="flex justify-center items-center mt-8"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div></div>}
          {error && <div className="bg-red-900 border border-red-700 text-red-300 p-4 rounded-lg max-w-2xl mx-auto text-center"><strong>Chyba:</strong> {error}</div>}

          {menuData && (
            <div className="max-w-4xl mx-auto mt-8 animate-fade-in">
              <h2 className="text-3xl font-bold mb-2 text-center">{menuData.restaurant_name}</h2>
              {menuData.date && /^\d{4}-\d{2}-\d{2}$/.test(menuData.date) && <p className="text-gray-400 text-center mb-6">{menuData.day_of_week}, {new Date(menuData.date).toLocaleDateString('cs-CZ')}</p>}
              
              {uniqueAllergens.length > 0 && (
                <div className="my-6 p-4 bg-gray-800/50 rounded-lg text-center">
                  <h4 className="font-semibold mb-2">Filtrovat alergeny:</h4>
                  <div className="flex flex-wrap justify-center gap-2">
                    {uniqueAllergens.map(allergen => (
                      <button key={allergen} onClick={() => handleAllergenToggle(allergen)} className={`px-3 py-1 text-sm rounded-full border ${allergenFilter.includes(allergen) ? 'bg-red-500 border-red-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}>
                        {allergen}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {Object.entries(filteredMenuItems.reduce((acc, item) => {
                  if (!acc[item.category]) acc[item.category] = [];
                  acc[item.category].push(item);
                  return acc;
                }, {})).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="text-2xl font-semibold text-purple-400 mb-4">{category}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {items.map((item, index) => (
                        <div key={index} className="bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-purple-500 hover:shadow-lg hover:scale-[1.02] transition-all duration-300">
                          <div className="flex justify-between items-start">
                            <div className="flex-grow pr-4">
                              <p className="font-semibold text-lg flex items-center">
                                {item.name}
                                {item.is_vegetarian && <span title="Vegetariánské" className="ml-2 text-green-400">🍃</span>}
                                {item.is_vegan && <span title="Veganské" className="ml-2 text-green-300">🌱</span>}
                              </p>
                            </div>
                            {item.price != null && <p className="text-xl font-bold text-purple-400 flex-shrink-0">{item.price} Kč</p>}
                          </div>
                          <div className="text-sm text-gray-400 mt-2">
                            {item.weight && <span>{item.weight} | </span>}
                            {item.allergens && item.allergens.length > 0 && <span>Alergeny: {item.allergens.join(', ')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
