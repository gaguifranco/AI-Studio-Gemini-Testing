import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import type { UserProfile, Suggestion } from './types';
import { analyzeMenu } from './services/geminiService';

// --- Constants ---
const PROFILE_STORAGE_KEY = 'userProfile';
const MENU_STORAGE_PREFIX = 'menu_';


// --- Helper Functions ---
const fileToDataUrl = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1];
      if (data && mimeType) {
        resolve({ base64: data, mimeType });
      } else {
        reject(new Error("Invalid file format."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const getStoredRestaurantNames = (): string[] => {
    const names = new Set<string>();
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(MENU_STORAGE_PREFIX)) {
            const name = key.substring(MENU_STORAGE_PREFIX.length).replace(/_/g, ' ');
            const capitalizedName = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            names.add(capitalizedName);
        }
    }
    return Array.from(names);
};

const loadProfile = (): UserProfile => {
  const defaultProfile: UserProfile = { tastes: [], allergies: [], preferences: [], mood: '', diet: [], budget: '' };
  try {
    const item = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!item) return defaultProfile;

    const parsed = JSON.parse(item);

    // Migration for old string-based values to new array-based values
    const arrayFields: (keyof UserProfile)[] = ['tastes', 'allergies', 'preferences', 'diet'];
    for (const field of arrayFields) {
      if (typeof parsed[field] === 'string') {
        parsed[field] = parsed[field] ? parsed[field].split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      }
    }

    return { ...defaultProfile, ...parsed };
  } catch (error) {
    console.error('Error loading profile from localStorage:', error);
    return defaultProfile;
  }
};


// --- Icon Components ---
const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-7.184c0-1.664.6-3.183 1.65-4.332zM2.25 7.5a.75.75 0 01.75.75v7.184c0 1.664-.6 3.183-1.65 4.332a.75.75 0 11-1.28-1.04A4.501 4.501 0 002.25 15.436V8.25a.75.75 0 01.75-.75z" clipRule="evenodd" />
  </svg>
);

const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
);

const ErrorIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);

const XMarkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
);
  
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.052-.143Z" clipRule="evenodd" />
    </svg>
);

const ClockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


// --- UI Components ---
const TagInput: React.FC<{
  name: string;
  value: string[];
  onChange: (e: { target: { name: string; value: string[] } }) => void;
  suggestions: string[];
  placeholder: string;
}> = ({ name, value: tags, onChange, suggestions, placeholder }) => {
  const [inputValue, setInputValue] = useState('');

  const addTag = (tagToAdd: string) => {
    const trimmedTag = tagToAdd.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      const newTags = [...tags, trimmedTag];
      onChange({ target: { name, value: newTags } });
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = tags.filter(tag => tag !== tagToRemove);
    onChange({ target: { name, value: newTags } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (suggestions.includes(newValue)) {
      addTag(newValue);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-shadow duration-200">
        {tags.map(tag => (
          <div key={tag} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 text-sm font-medium px-2.5 py-1 rounded-full">
            <span>{tag}</span>
            <button type="button" onClick={() => removeTag(tag)} className="text-indigo-500 hover:text-indigo-700 focus:outline-none">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : "Adicionar mais..."}
          className="flex-grow bg-transparent p-1 focus:outline-none"
          list={`${name}-suggestions`}
        />
      </div>
      <datalist id={`${name}-suggestions`}>
        {suggestions.filter(s => !tags.includes(s)).map(suggestion => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
};


interface ProfileFormProps {
  profile: UserProfile;
  onProfileChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onTagsChange: (name: keyof UserProfile, value: string[]) => void;
  onSaveProfile: () => void;
  errors: Partial<Record<keyof UserProfile, string>>;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ profile, onProfileChange, onTagsChange, onSaveProfile, errors }) => {
  const [showSavedMessage, setShowSavedMessage] = useState(false);

  const profileFields = [
    { name: 'tastes', label: 'Gostos e Sabores', placeholder: 'Adicione um gosto...', required: true, type: 'tag', suggestions: ['Italiana', 'Mexicana', 'Apimentada', 'Doce', 'Salgado', 'Japonesa', 'Chinesa', 'Indiana', 'Tailandesa', 'Comida Caseira'] },
    { name: 'allergies', label: 'Alergias', placeholder: 'Adicione uma alergia...', type: 'tag', suggestions: ['Nenhuma', 'Amendoim', 'Glúten', 'Laticínios', 'Marisco', 'Soja', 'Frutos Secos', 'Ovos'] },
    { name: 'preferences', label: 'Cozinhas e Preferências', placeholder: 'Adicione uma preferência...', type: 'tag', suggestions: ['Vegetariano', 'Vegano', 'Pescetariano', 'Sem Glúten', 'Orgânico', 'Italiana', 'Mexicana', 'Apimentada'] },
    { name: 'mood', label: 'Humor Atual', placeholder: 'ex: aventureiro, comida caseira, leve e saudável', required: true, suggestions: ['Aventureiro', 'Reconfortante', 'Saudável', 'Leve', 'Comemorativo', 'Rápido e Fácil', 'Rico e Decadente'] },
    { name: 'diet', label: 'Restrições Alimentares', placeholder: 'Adicione uma restrição...', type: 'tag', suggestions: ['Nenhuma', 'Cetogênica', 'Paleo', 'Low-Carb', 'Baixo Sódio', 'Baixa Gordura', 'Alta Proteína'] },
    { name: 'budget', label: 'Orçamento', placeholder: 'ex: acessível, médio, luxo', suggestions: ['Acessível ($)', 'Médio ($$)', 'Luxo ($$$)', 'Requintado ($$$$)'] },
  ];
  
  const handleSaveClick = () => {
    onSaveProfile();
    setShowSavedMessage(true);
    setTimeout(() => {
      setShowSavedMessage(false);
    }, 3000); // Message disappears after 3 seconds
  };

  return (
    <>
      <div
        role="alert"
        aria-live="assertive"
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 ease-in-out
        ${showSavedMessage ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
      >
        <CheckIcon className="h-5 w-5" />
        <span>Perfil salvo com sucesso!</span>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Seu Perfil Gastronômico</h2>
        <div className="grid grid-cols-1 gap-6">
          {profileFields.map(field => {
            const fieldName = field.name as keyof UserProfile;
            const hasError = !!errors[fieldName];
            const fieldType = (field as any).type;

            return (
              <div key={field.name}>
                <label htmlFor={field.name} className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>

                {fieldType === 'tag' ? (
                  <TagInput
                      name={field.name}
                      value={profile[fieldName] as string[]}
                      onChange={({ target }) => onTagsChange(target.name as keyof UserProfile, target.value)}
                      placeholder={field.placeholder || ''}
                      suggestions={field.suggestions || []}
                    />
                ) : (
                  <>
                    <input
                      type="text"
                      id={field.name}
                      name={field.name}
                      value={profile[fieldName] as string}
                      onChange={onProfileChange}
                      placeholder={field.placeholder}
                      className={`w-full px-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 transition-shadow duration-200 ${hasError ? 'border-red-500 ring-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-200 focus:ring-indigo-500 focus:border-indigo-500'}`}
                      aria-invalid={hasError}
                      aria-describedby={hasError ? `${field.name}-error` : undefined}
                      list={field.suggestions ? `${field.name}-suggestions` : undefined}
                    />
                    {field.suggestions && (
                      <datalist id={`${field.name}-suggestions`}>
                        {field.suggestions.map((suggestion) => (
                          <option key={suggestion} value={suggestion} />
                        ))}
                      </datalist>
                    )}
                  </>
                )}

                {hasError && <p id={`${field.name}-error`} className="mt-1 text-sm text-red-600">{errors[fieldName]}</p>}
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex items-center justify-end gap-4">
          <button
            onClick={handleSaveClick}
            className="px-5 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Salvar Perfil
          </button>
        </div>
      </div>
    </>
  );
};

interface MenuUploaderProps {
  onImageUpload: (files: FileList) => void;
  images: Array<{ url: string }>;
  onRemoveImage: (index: number) => void;
  restaurantName: string;
  onRestaurantNameChange: (name: string) => void;
  storedRestaurantNames: string[];
  isUploading: boolean;
}

const MenuUploader: React.FC<MenuUploaderProps> = ({ onImageUpload, images, onRemoveImage, restaurantName, onRestaurantNameChange, storedRestaurantNames, isUploading }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImageUpload(e.target.files);
    }
  };

  const suggestionsToShow = restaurantName
    ? storedRestaurantNames.filter(name => name.toLowerCase().includes(restaurantName.toLowerCase()))
    : storedRestaurantNames;

  const renderContent = () => {
    if (images.length === 0) {
        return (
            <label htmlFor="menu-upload" className="flex-grow flex flex-col justify-center items-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors duration-200">
              <UploadIcon className="w-12 h-12 text-gray-400 mb-4" />
              <span className="text-indigo-600 font-semibold">Clique para enviar fotos do menu</span>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG ou WEBP (pode selecionar vários)</p>
              <input id="menu-upload" type="file" accept="image/*" onChange={handleFileChange} className="hidden" multiple />
            </label>
        );
    }

    return (
        <div className="flex-grow flex flex-col">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              {images.map((image, index) => (
                  <div key={index} className="relative group">
                      <img src={image.url} alt={`Menu page ${index + 1}`} className="w-full h-32 object-cover rounded-lg border-2 border-gray-200" />
                      <button 
                        onClick={() => onRemoveImage(index)}
                        className="absolute top-1 right-1 bg-black bg-opacity-50 text-white rounded-full p-1 group-hover:opacity-100 opacity-0 transition-opacity duration-200"
                        aria-label={`Remove menu page ${index + 1}`}
                      >
                         <XMarkIcon className="w-4 h-4" />
                      </button>
                  </div>
              ))}
          </div>
          <label htmlFor="menu-upload-add" className="w-full text-center px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors duration-200">
            Adicionar mais fotos
          </label>
          <input id="menu-upload-add" type="file" accept="image/*" onChange={handleFileChange} className="hidden" multiple />
        </div>
    );
  };
  
  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100 h-full flex flex-col relative">
      {isUploading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex flex-col justify-center items-center z-10 rounded-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            <p className="mt-4 font-semibold text-gray-600">Processando Imagens...</p>
        </div>
      )}
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Menu do Restaurante</h2>
      <div className="mb-4">
        <label htmlFor="restaurant-name" className="block text-sm font-medium text-gray-700 mb-1">
          Nome do Restaurante <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            id="restaurant-name"
            name="restaurant-name"
            value={restaurantName}
            onChange={(e) => onRestaurantNameChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="ex: A Grande Brasserie"
            className="w-full pl-4 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow duration-200"
            autoComplete="off"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
          </div>

          {showSuggestions && suggestionsToShow.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto" role="listbox">
               <li className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Restaurantes Salvos</li>
              {suggestionsToShow.map(name => (
                <li key={name}
                    role="option"
                    aria-selected={name === restaurantName}
                    className="px-4 py-3 cursor-pointer hover:bg-indigo-50 text-gray-800 text-sm flex items-center justify-between"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onRestaurantNameChange(name);
                        setShowSuggestions(false);
                    }}
                >
                    <span>{name}</span>
                    {name === restaurantName && (
                        <CheckIcon className="w-5 h-5 text-indigo-600" />
                    )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

const SuggestionCard: React.FC<{ suggestion: Suggestion }> = ({ suggestion }) => (
  <div className="bg-white rounded-xl shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 border border-gray-100">
    <div className="p-6">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-gray-900">{suggestion.dishName}</h3>
        <p className="text-lg font-semibold text-indigo-600">{suggestion.price}</p>
      </div>
      <p className="mt-2 text-gray-600">{suggestion.description}</p>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm font-semibold text-gray-800 flex items-center">
          <SparklesIcon className="w-5 h-5 mr-2 text-amber-500" />
          Por que recomendamos:
        </p>
        <p className="mt-1 text-sm text-gray-500">{suggestion.reasonForRecommendation}</p>
      </div>
    </div>
  </div>
);


const ResultsDisplay: React.FC<{ isLoading: boolean; error: string | null; suggestions: Suggestion[] }> = ({ isLoading, error, suggestions }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl shadow-lg border border-gray-100 h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-lg font-semibold text-gray-700">Analisando seu menu...</p>
        <p className="text-sm text-gray-500">A IA está encontrando os pratos perfeitos para você.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 bg-red-50 text-red-700 rounded-2xl shadow-lg border border-red-200 h-full">
        <ErrorIcon className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-xl font-bold mb-2">Análise Falhou</h3>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (suggestions.length > 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800 text-center">Suas Sugestões Personalizadas</h2>
        {suggestions.map((s, index) => (
          <SuggestionCard key={index} suggestion={s} />
        ))}
      </div>
    );
  }

  return null;
};

interface RestaurantHistoryProps {
  storedRestaurantNames: string[];
  onSelectRestaurant: (name: string) => void;
  currentRestaurant: string;
}

const RestaurantHistory: React.FC<RestaurantHistoryProps> = ({ storedRestaurantNames, onSelectRestaurant, currentRestaurant }) => {
  if (storedRestaurantNames.length === 0) {
    return null;
  }

  return (
    <div className="mb-10 md:mb-12 p-6 bg-white rounded-2xl shadow-lg border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-3">
        <ClockIcon className="w-6 h-6 text-indigo-500" />
        <span>Histórico de Restaurantes</span>
      </h2>
      <p className="text-sm text-gray-500 mb-5">Clique em um restaurante para carregar o menu salvo.</p>
      <div className="flex flex-wrap gap-3">
        {storedRestaurantNames.map(name => {
            const isSelected = name === currentRestaurant;
            return (
                <button
                    key={name}
                    onClick={() => onSelectRestaurant(name)}
                    className={`px-4 py-2 border rounded-full font-medium transition-all duration-200 shadow-sm text-sm
                        ${isSelected 
                            ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-offset-2 ring-indigo-500' 
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                        }
                    `}
                >
                    {name}
                </button>
            )
        })}
      </div>
    </div>
  );
};


// --- Main App Component ---
export default function App() {
  const [profile, setProfile] = useState<UserProfile>(loadProfile());
  const [restaurantName, setRestaurantName] = useState('');
  const [menuImages, setMenuImages] = useState<Array<{ url: string; base64: string; mimeType: string }>>([]);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileErrors, setProfileErrors] = useState<Partial<Record<keyof UserProfile, string>>>({});
  const [storedRestaurantNames, setStoredRestaurantNames] = useState<string[]>(getStoredRestaurantNames());

  // Effect to load a stored menu when restaurant name changes
  useEffect(() => {
    const loadMenuForRestaurant = () => {
      if (!restaurantName.trim()) {
        setMenuImages([]);
        return;
      }
      try {
        const key = `${MENU_STORAGE_PREFIX}${restaurantName.trim().toLowerCase().replace(/ /g, '_')}`;
        const item = window.localStorage.getItem(key);
        if (item) {
          const storedMenu: Array<{ base64: string; mimeType: string }> = JSON.parse(item);
          if (Array.isArray(storedMenu)) {
            const imageUrls = storedMenu.map(img => ({ ...img, url: `data:${img.mimeType};base64,${img.base64}` }));
            setMenuImages(imageUrls);
            setError(null);
            setSuggestions([]);
          }
        } else {
            setMenuImages([]); // No saved menu, clear the list
        }
      } catch (error) {
        console.error('Error loading menu from localStorage:', error);
        setMenuImages([]);
      }
    };
    
    const handler = setTimeout(() => {
        loadMenuForRestaurant();
    }, 300);

    return () => {
        clearTimeout(handler);
    };
  }, [restaurantName]);
  
  const handleProfileChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
    if (profileErrors[name as keyof UserProfile]) {
        setProfileErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[name as keyof UserProfile];
            return newErrors;
        });
    }
  }, [profileErrors]);

  const handleTagsChange = useCallback((name: keyof UserProfile, value: string[]) => {
      setProfile(prev => ({...prev, [name]: value}));
      if (profileErrors[name as keyof UserProfile]) {
          setProfileErrors(prev => {
              const newErrors = { ...prev };
              delete newErrors[name as keyof UserProfile];
              return newErrors;
          });
      }
  }, [profileErrors]);
  
  const handleSaveProfile = useCallback(() => {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
      console.error('Failed to save profile:', err);
    }
  }, [profile]);

  const handleImageUpload = useCallback(async (files: FileList) => {
    setIsImageUploading(true);
    setError(null); // Clear previous errors on new upload
    try {
        const newImagesPromises = Array.from(files).map(async (file) => {
            const { base64, mimeType } = await fileToDataUrl(file);
            return { url: URL.createObjectURL(file), base64, mimeType };
        });

        const newImages = await Promise.all(newImagesPromises);
        
        const updatedImageList = [...menuImages, ...newImages];
        setMenuImages(updatedImageList);
        setSuggestions([]);
        
        if (restaurantName.trim()) {
            const key = `${MENU_STORAGE_PREFIX}${restaurantName.trim().toLowerCase().replace(/ /g, '_')}`;
            const imagesToStore = updatedImageList.map(({ base64, mimeType }) => ({ base64, mimeType }));
            window.localStorage.setItem(key, JSON.stringify(imagesToStore));
            setStoredRestaurantNames(getStoredRestaurantNames());
        }
    } catch (err) {
      setError("Não foi possível processar o(s) arquivo(s) de imagem. Por favor, tente novamente.");
      console.error(err);
    } finally {
      setIsImageUploading(false);
    }
  }, [restaurantName, menuImages]);

  const handleRemoveImage = useCallback((indexToRemove: number) => {
    const updatedImages = menuImages.filter((_, index) => index !== indexToRemove);
    setMenuImages(updatedImages);

    if (restaurantName.trim()) {
        const key = `${MENU_STORAGE_PREFIX}${restaurantName.trim().toLowerCase().replace(/ /g, '_')}`;
        const dataToStore = updatedImages.map(({ base64, mimeType }) => ({ base64, mimeType }));
        if(dataToStore.length > 0) {
            window.localStorage.setItem(key, JSON.stringify(dataToStore));
        } else {
            window.localStorage.removeItem(key);
            setStoredRestaurantNames(getStoredRestaurantNames());
        }
    }
  }, [menuImages, restaurantName]);
  
  const validateProfile = () => {
    const errors: Partial<Record<keyof UserProfile, string>> = {};
    if (profile.tastes.length === 0) {
        errors.tastes = "Por favor, compartilhe seus gostos para obter as melhores recomendações.";
    }
    if (!profile.mood.trim()) {
        errors.mood = "Seu humor nos ajuda a encontrar o prato perfeito para você agora.";
    }
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAnalyzeMenu = async () => {
    setError(null);
    if (!validateProfile()) return;
    
    if (!restaurantName.trim()) {
        setError("Por favor, insira o nome do restaurante.");
        return;
    }
    if (menuImages.length === 0) {
      setError("Por favor, envie pelo menos uma imagem do menu.");
      return;
    }

    setIsLoading(true);
    setSuggestions([]);

    try {
      const imagesToAnalyze = menuImages.map(({ base64, mimeType }) => ({ base64, mimeType }));
      const result = await analyzeMenu(profile, imagesToAnalyze);
      setSuggestions(result.suggestions);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Ocorreu um erro desconhecido.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <main className="container mx-auto px-4 py-8 md:py-12">
        <header className="text-center mb-10 md:mb-16">
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-gray-800">
            Recomendador de Menus por IA
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Fotografe um menu, diga-nos os seus desejos e deixe a IA descobrir a sua próxima refeição favorita.
          </p>
        </header>

        <RestaurantHistory
          storedRestaurantNames={storedRestaurantNames}
          onSelectRestaurant={setRestaurantName}
          currentRestaurant={restaurantName}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-8">
            <ProfileForm 
              profile={profile} 
              onProfileChange={handleProfileChange} 
              onTagsChange={handleTagsChange}
              onSaveProfile={handleSaveProfile}
              errors={profileErrors} 
            />
            <MenuUploader 
              onImageUpload={handleImageUpload} 
              images={menuImages}
              onRemoveImage={handleRemoveImage}
              restaurantName={restaurantName}
              onRestaurantNameChange={setRestaurantName}
              storedRestaurantNames={storedRestaurantNames}
              isUploading={isImageUploading}
            />
          </div>
          
          <div className="lg:sticky lg:top-8">
             <div className="w-full mb-8">
                <button
                    onClick={handleAnalyzeMenu}
                    disabled={menuImages.length === 0 || isLoading}
                    className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                >
                    <SparklesIcon className="w-6 h-6" />
                    {isLoading ? 'Pensando...' : 'Encontrar Minha Refeição'}
                </button>
            </div>
            <ResultsDisplay isLoading={isLoading} error={error} suggestions={suggestions} />
            {!isLoading && !error && suggestions.length === 0 && (
                <div className="text-center p-8 bg-white rounded-2xl shadow-lg border border-gray-100">
                    <h3 className="text-xl font-semibold text-gray-700">Pronto para Recomendações?</h3>
                    <p className="mt-2 text-gray-500">
                        Digite o nome de um restaurante, envie o menu e clique em "Encontrar Minha Refeição" para começar!
                    </p>
                </div>
            )}
          </div>
        </div>
      </main>
      <footer className="text-center py-6 mt-12 text-sm text-gray-500 border-t border-gray-200">
        <p>&copy; {new Date().getFullYear()} Scanner de Menu IA. Desenvolvido com Gemini.</p>
      </footer>
    </div>
  );
}
