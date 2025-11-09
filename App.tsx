import React, { useState, useCallback, ChangeEvent, useEffect, useRef } from 'react';
import type { UserProfile, Suggestion, NutritionalInfo } from './types';
import { analyzeMenu } from './services/geminiService';

// --- IndexedDB Helpers ---
const DB_NAME = 'MenuRecommenderDB';
const STORE_NAME = 'menus';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject('IndexedDB is not supported by this browser.');
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Fix: Add a trailing comma to the generic type parameter `<T,>`. 
// This is a known workaround to prevent the TSX parser from misinterpreting `<T>` as a JSX tag, 
// which can cause a cascade of parsing errors throughout the file.
const getFromDB = <T,>(db: IDBDatabase, key: string): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
};

const saveToDB = (db: IDBDatabase, key: string, value: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const deleteFromDB = (db: IDBDatabase, key: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const getAllKeysFromDB = (db: IDBDatabase): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();
        request.onsuccess = () => resolve((request.result as IDBValidKey[]).map(String));
        request.onerror = () => reject(request.error);
    });
};

// --- Types ---
type ImageState = {
  file: File;
  url: string;
  base64: string;
  mimeType: string;
  status: 'uploading' | 'ready';
};

type SavedProfiles = { [key: string]: UserProfile };


// --- Constants ---
const PROFILES_STORAGE_KEY = 'userProfiles';
const LAST_PROFILE_NAME_KEY = 'lastActiveProfileName';


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

const getDefaultProfile = (): UserProfile => ({
    tastes: '', allergies: '', preferences: '', mood: '', diet: '', budget: ''
});

const loadProfilesAndSetActive = (): { savedProfiles: SavedProfiles; activeProfileName: string; activeProfile: UserProfile } => {
    const defaultProfile = getDefaultProfile();
    try {
        const profilesJson = window.localStorage.getItem(PROFILES_STORAGE_KEY);
        const savedProfiles: SavedProfiles = profilesJson ? JSON.parse(profilesJson) : {};
        
        const lastActiveName = window.localStorage.getItem(LAST_PROFILE_NAME_KEY) || '';
        
        const activeProfile = savedProfiles[lastActiveName] || defaultProfile;

        return { savedProfiles, activeProfileName: lastActiveName, activeProfile };
    } catch (error) {
        console.error('Error loading profiles from localStorage:', error);
        return { savedProfiles: {}, activeProfileName: '', activeProfile: defaultProfile };
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

const CameraIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
);

const InformationCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
);

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
);

const ArrowPathIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-4.991-2.695v-4.992m0 0h-4.992m4.992 0l-3.181-3.183a8.25 8.25 0 00-11.664 0l-3.181 3.183" />
    </svg>
);

const UserCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
);

const TableIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h.008v.015h-.008v-.015Zm17.25 0h-.008v.015h.008v-.015Zm-17.25 0v-2.25c0-.621.504-1.125 1.125-1.125h15c.621 0 1.125.504 1.125 1.125v2.25m-17.25 0h17.25M3.375 15h17.25M3.375 12h17.25m-17.25 0v-1.5c0-.621.504-1.125 1.125-1.125h15c.621 0 1.125.504 1.125 1.125v1.5m-17.25 0h17.25M3.375 9h17.25m-17.25 0v-1.5c0-.621.504-1.125 1.125-1.125h15c.621 0 1.125.504 1.125 1.125v1.5M3.375 6h17.25m-17.25 0v-1.5c0-.621.504-1.125 1.125-1.125h15c.621 0 1.125.504 1.125 1.125v1.5" />
    </svg>
);


// --- UI Components ---

interface ToastNotificationProps {
    show: boolean;
    message: string;
    icon: React.ReactNode;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ show, message, icon }) => (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 ease-in-out
      ${show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}
    >
      {icon}
      <span>{message}</span>
    </div>
);

interface CameraModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
}
  
const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const startCamera = async () => {
            if (isOpen && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing camera: ", err);
                    alert("Não foi possível acessar a câmera. Verifique as permissões do seu navegador.");
                    onClose();
                }
            }
        };

        const stopCamera = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };

        if (isOpen) {
            startCamera();
        } else {
            stopCamera();
        }

        return () => {
            stopCamera();
        };
    }, [isOpen, onClose]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                    if (blob) {
                        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
                        onCapture(file);
                        onClose();
                    }
                }, 'image/jpeg');
            }
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="relative bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-3xl p-4 space-y-4">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded-md aspect-video bg-black"></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                <div className="flex justify-center gap-4">
                    <button onClick={handleCapture} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-full shadow-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
                        <CameraIcon className="w-6 h-6" />
                        Capturar
                    </button>
                    <button onClick={onClose} className="px-8 py-3 bg-gray-600 text-white font-semibold rounded-full hover:bg-gray-700 transition-colors">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ConfirmationModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    message: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onConfirm, onCancel, title, message }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center">
                <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                <p className="mt-2 text-sm text-gray-600">
                    {message}
                </p>
                <div className="mt-6 flex justify-center gap-4">
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        Sim
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                    >
                        Não
                    </button>
                </div>
            </div>
        </div>
    );
};


interface NutritionalInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    suggestion: Suggestion | null;
}

const NutritionalInfoModal: React.FC<NutritionalInfoModalProps> = ({ isOpen, onClose, suggestion }) => {
    if (!isOpen || !suggestion || !suggestion.nutritionalInfo) return null;

    const nutritionalData = [
        { label: 'Calorias', value: suggestion.nutritionalInfo.calories },
        { label: 'Carboidratos', value: suggestion.nutritionalInfo.carbohydrates },
        { label: 'Gorduras', value: suggestion.nutritionalInfo.fats },
        { label: 'Proteína', value: suggestion.nutritionalInfo.protein },
        { label: 'Sódio', value: suggestion.nutritionalInfo.sodium },
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Estimativa Nutricional</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <p className="text-gray-700 font-semibold mb-1">{suggestion.dishName}</p>
                <p className="text-sm text-gray-500 mb-4">
                    Valores aproximados para uma porção de 100g, baseados nos ingredientes do prato.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 rounded-l-lg">Nutriente</th>
                                <th scope="col" className="px-6 py-3 rounded-r-lg">Valor Aproximado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nutritionalData.map((item, index) => (
                                <tr key={item.label} className="bg-white border-b">
                                    <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{item.label}</th>
                                    <td className="px-6 py-4">{item.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-6 text-right">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};


interface ProfileFormProps {
  profile: UserProfile;
  profileName: string;
  onProfileChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onProfileNameChange: (name: string) => void;
  onSaveProfile: () => void;
  onDeleteProfile: () => void;
  onReset: () => void;
  savedProfileNames: string[];
}

const ProfileForm: React.FC<ProfileFormProps> = ({ profile, profileName, onProfileChange, onProfileNameChange, onSaveProfile, onDeleteProfile, onReset, savedProfileNames }) => {
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [showProfileSuggestions, setShowProfileSuggestions] = useState(false);


  const profileFields = [
    { name: 'tastes', label: 'Gostos e Sabores', placeholder: 'ex: Italiana, Apimentada, Comida Caseira' },
    { name: 'allergies', label: 'Alergias', placeholder: 'ex: Amendoim, Glúten, Laticínios' },
    { name: 'preferences', label: 'Cozinhas e Preferências', placeholder: 'ex: Vegetariano, Sem Glúten, Orgânico' },
    { name: 'mood', label: 'Humor Atual', placeholder: 'ex: aventureiro, comida caseira, leve e saudável' },
    { name: 'diet', label: 'Restrições Alimentares', placeholder: 'ex: Cetogênica, Baixo Sódio' },
    { name: 'budget', label: 'Orçamento', placeholder: 'ex: acessível, médio, luxo' },
  ];
  
  const handleSaveClick = () => {
    if (!profileName.trim()) {
        // Optionally, add validation feedback here
        return;
    }
    onSaveProfile();
    setShowSavedMessage(true);
    setTimeout(() => {
      setShowSavedMessage(false);
    }, 3000); // Message disappears after 3 seconds
  };

  return (
    <>
      <ToastNotification 
        show={showSavedMessage}
        message="Perfil salvo com sucesso!"
        icon={<CheckIcon className="h-5 w-5" />}
      />

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Seu Perfil Gastronômico</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-2">
              <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-50 rounded-md hover:bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  aria-label="Limpar todos os campos e recomeçar"
              >
                  <ArrowPathIcon className="w-4 h-4" />
                  <span>Recomeçar</span>
              </button>
            </div>
        </div>
        <div className="grid grid-cols-1 gap-6">
          <div className="relative">
            <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">
              Qual seu perfil (Crie ou Escolha)?
            </label>
            <div className="relative">
              <UserCircleIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                id="profile-name"
                value={profileName}
                onChange={(e) => onProfileNameChange(e.target.value)}
                onFocus={() => setShowProfileSuggestions(true)}
                onBlur={() => setTimeout(() => setShowProfileSuggestions(false), 200)}
                placeholder="ex: Meu Perfil Vegano"
                className="w-full pl-10 pr-10 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow duration-200"
                autoComplete="off"
              />
              <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"/>
            </div>
            {showProfileSuggestions && savedProfileNames.length > 0 && (
              <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {savedProfileNames.map(name => (
                  <li
                    key={name}
                    onMouseDown={() => {
                      onProfileNameChange(name);
                      setShowProfileSuggestions(false);
                    }}
                    className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {profileFields.map(field => {
            const fieldName = field.name as keyof UserProfile;

            return (
              <div key={field.name}>
                <label htmlFor={field.name} className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                </label>
                <input
                  type="text"
                  id={field.name}
                  name={field.name}
                  value={profile[fieldName]}
                  onChange={onProfileChange}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow duration-200"
                />
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={onDeleteProfile}
            disabled={!profileName.trim() || !savedProfileNames.includes(profileName)}
            className="px-5 py-2 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            Apagar Perfil
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={!profileName.trim()}
            className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
          >
            Salvar Perfil
          </button>
        </div>
      </div>
    </>
  );
};

interface ImageThumbnailProps {
    image: ImageState;
    index: number;
    onRemoveImage: (index: number) => void;
}
  
const ImageThumbnail: React.FC<ImageThumbnailProps> = ({ image, index, onRemoveImage }) => {
    const [isVisible, setIsVisible] = useState(false);
    const placeholderRef = useRef<HTMLDivElement>(null);
  
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    // Disconnect the observer once the image is visible
                    if (placeholderRef.current) {
                        observer.unobserve(placeholderRef.current);
                    }
                }
            },
            {
                rootMargin: '0px 0px 100px 0px', // Pre-load images 100px before they enter the viewport
            }
        );
    
        if (placeholderRef.current) {
            observer.observe(placeholderRef.current);
        }
    
        return () => {
            if (placeholderRef.current) {
                observer.unobserve(placeholderRef.current);
            }
        };
    }, []);
  
    return (
        <div ref={placeholderRef} className="relative group aspect-w-1 aspect-h-1 bg-gray-100 rounded-lg overflow-hidden">
            {isVisible && <img src={image.url} alt={`Menu page ${index + 1}`} className="object-cover w-full h-full" />}
            
            {image.status === 'uploading' && (
                <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            )}

            {image.status === 'ready' && (
                <>
                    <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-md pointer-events-none group-hover:opacity-0 transition-opacity">
                        <CheckIcon className="w-3 h-3" />
                    </div>
                    <button
                        onClick={() => onRemoveImage(index)}
                        className="absolute top-1.5 right-1.5 bg-black bg-opacity-60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
                        aria-label={`Remove image ${index + 1}`}
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </>
            )}
        </div>
    );
};

interface MenuUploaderProps {
  onImageUpload: (files: File[]) => void;
  images: ImageState[];
  onRemoveImage: (index: number) => void;
  restaurantName: string;
  onRestaurantNameChange: (name: string) => void;
  restaurantNameError: string | null;
  restaurantNameWarning: string | null;
  storedRestaurantNames: string[];
  isUploading: boolean;
  onSaveMenu: () => Promise<void>;
  onDeleteMenu: () => void;
  onTakePhotoClick: () => void;
}

const MenuUploader: React.FC<MenuUploaderProps> = ({ onImageUpload, images, onRemoveImage, restaurantName, onRestaurantNameChange, restaurantNameError, restaurantNameWarning, storedRestaurantNames, isUploading, onSaveMenu, onDeleteMenu, onTakePhotoClick }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImageUpload(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onImageUpload(Array.from(e.dataTransfer.files));
      }
  };

  const suggestionsToShow = restaurantName
    ? storedRestaurantNames.filter(name => name.toLowerCase().includes(restaurantName.toLowerCase()))
    : storedRestaurantNames;

  const handleSaveClick = async () => {
    await onSaveMenu();
    setShowSavedMessage(true);
    setTimeout(() => {
        setShowSavedMessage(false);
    }, 3000);
  };

  const renderContent = () => {
    if (images.length === 0) {
        return (
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg p-6 transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50'}`}
            >
                <UploadIcon className="w-10 h-10 mb-4 text-gray-400" />
                <p className="mb-4 text-sm text-center text-gray-500">Arraste e solte os arquivos aqui ou escolha uma opção</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <label
                        htmlFor="menu-upload"
                        className="cursor-pointer inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <UploadIcon className="w-5 h-5" />
                        <span>Enviar Arquivo</span>
                         <input
                            id="menu-upload"
                            type="file"
                            className="sr-only"
                            onChange={handleFileChange}
                            multiple
                            accept="image/png, image/jpeg"
                            disabled={isUploading}
                        />
                    </label>
                    <button
                        type="button"
                        onClick={onTakePhotoClick}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-gray-700 font-semibold rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
                    >
                        <CameraIcon className="w-5 h-5" />
                        <span>Tirar Foto</span>
                    </button>
                </div>
            </div>
        );
    } else {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {images.map((image, index) => (
                        <ImageThumbnail 
                            key={image.url}
                            image={image}
                            index={index}
                            onRemoveImage={onRemoveImage}
                        />
                    ))}
                     <div className="flex flex-col items-center justify-center w-full h-full border-2 border-gray-300 border-dashed rounded-lg bg-gray-50 p-4 gap-2">
                        <label htmlFor="menu-upload-more" className="w-full text-center cursor-pointer px-3 py-2 bg-white border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                            <UploadIcon className="w-4 h-4" />
                            Adicionar Arquivo
                        </label>
                        <button type="button" onClick={onTakePhotoClick} className="w-full text-center cursor-pointer px-3 py-2 bg-white border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                            <CameraIcon className="w-4 h-4" />
                            Tirar Foto
                        </button>
                        <input
                            id="menu-upload-more"
                            type="file"
                            className="sr-only"
                            onChange={handleFileChange}
                            multiple
                            accept="image/png, image/jpeg"
                            disabled={isUploading}
                        />
                    </div>
                </div>
            </div>
        );
    }
  };

  const canSave = restaurantName.trim().length > 0 && images.length > 0 && !isUploading;
  const restaurantExists = restaurantName.trim() && storedRestaurantNames.some(name => name.toLowerCase() === restaurantName.trim().toLowerCase());

  return (
    <>
      <ToastNotification 
        show={showSavedMessage}
        message="Menu salvo no histórico!"
        icon={<CheckIcon className="h-5 w-5" />}
      />

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Anexar Menu do Restaurante</h2>
          <p className="text-gray-600">Envie imagens claras do menu para obter as melhores recomendações.</p>
        </div>

        <div className="relative">
          <label htmlFor="restaurant-name" className="block text-sm font-medium text-gray-700 mb-1">
            Nome do Restaurante
          </label>
          <div className="relative">
              <ClockIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                id="restaurant-name"
                value={restaurantName}
                onChange={(e) => onRestaurantNameChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click on suggestion
                placeholder="Digite ou selecione do histórico"
                className={`w-full pl-10 pr-10 px-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 transition-shadow duration-200 ${restaurantNameError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-200 focus:ring-indigo-500 focus:border-indigo-500'}`}
                autoComplete="off"
                aria-invalid={!!restaurantNameError}
                aria-describedby="restaurant-name-error"
              />
              <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"/>
          </div>
          {restaurantNameError && (
              <p id="restaurant-name-error" className="mt-1.5 text-sm text-red-600 flex items-center gap-1.5">
                  <ErrorIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{restaurantNameError}</span>
              </p>
          )}
          {restaurantNameWarning && !restaurantNameError && (
              <p id="restaurant-name-warning" className="mt-1.5 text-sm text-gray-500 flex items-center gap-1.5">
                  <InformationCircleIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{restaurantNameWarning}</span>
              </p>
          )}
          {showSuggestions && suggestionsToShow.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {suggestionsToShow.map(name => (
                <li
                  key={name}
                  onMouseDown={() => {
                    onRestaurantNameChange(name);
                    setShowSuggestions(false);
                  }}
                  className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {renderContent()}

        <div className="pt-2 flex justify-end items-center gap-4">
            <button
                type="button"
                onClick={onDeleteMenu}
                disabled={!restaurantExists}
                className="px-5 py-2 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
                Apagar Restaurante
            </button>
            <button
                type="button"
                onClick={handleSaveClick}
                disabled={!canSave}
                className="px-5 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
                Salvar Restaurante
            </button>
        </div>

      </div>
    </>
  );
};

interface SuggestionCardProps {
    suggestion: Suggestion;
    index: number;
    onShowNutrition: (suggestion: Suggestion) => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, index, onShowNutrition }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Stagger the animation of each card
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, index * 100); // 100ms delay per card

        return () => clearTimeout(timer);
    }, [index]);

    return (
        <div className={`bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 transform hover:scale-[1.02] transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="p-6">
            <div className="flex justify-between items-start">
                <h3 className="text-xl font-bold text-gray-900">{suggestion.dishName}</h3>
                <p className="text-lg font-semibold text-indigo-600">{suggestion.price}</p>
            </div>
            <p className="mt-1 text-gray-600">{suggestion.description}</p>
            <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-amber-500" />
                    Por que recomendamos:
                </h4>
                <p className="mt-1 text-gray-600">{suggestion.reasonForRecommendation}</p>
            </div>
             {suggestion.nutritionalInfo && (
                <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                    <button
                        type="button"
                        onClick={() => onShowNutrition(suggestion)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                        <TableIcon className="w-4 h-4" />
                        Informação Nutricional
                    </button>
                </div>
            )}
          </div>
        </div>
    );
};

interface AnalysisResultsProps {
    suggestions: Suggestion[];
    isLoading: boolean;
    error: string | null;
    onShowNutrition: (suggestion: Suggestion) => void;
}
  
const AnalysisResults: React.FC<AnalysisResultsProps> = ({ suggestions, isLoading, error, onShowNutrition }) => {
    const [filterText, setFilterText] = useState('');
    const [activeCategory, setActiveCategory] = useState('Todos');

    useEffect(() => {
        // Reset filters when new suggestions arrive
        setActiveCategory('Todos');
        setFilterText('');
    }, [suggestions]);


    if (isLoading) {
      return (
        <div className="text-center p-8">
            <div role="status" className="flex flex-col items-center justify-center gap-4">
                <svg aria-hidden="true" className="w-12 h-12 text-gray-200 animate-spin fill-indigo-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
                    <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0492C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
                </svg>
                <span className="text-lg font-medium text-gray-700">A IA está analisando o menu...</span>
                <p className="text-gray-500">Isso pode levar alguns segundos. Estamos preparando as melhores sugestões para você!</p>
            </div>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-r-lg">
            <div className="flex">
                <div className="py-1">
                    <ErrorIcon className="h-6 w-6 text-red-500 mr-4" />
                </div>
                <div>
                    <p className="text-lg font-bold text-red-800">Ocorreu um erro</p>
                    <p className="mt-1 text-red-700">{error}</p>
                </div>
            </div>
        </div>
      );
    }
  
    if (suggestions.length === 0) {
      return null;
    }
  
    const categories = ['Todos', ...new Set(suggestions.map(s => s.category).filter(Boolean))];

    const filteredSuggestions = suggestions
        .filter(suggestion => activeCategory === 'Todos' || suggestion.category === activeCategory)
        .filter(suggestion =>
            suggestion.dishName.toLowerCase().includes(filterText.toLowerCase()) ||
            suggestion.description.toLowerCase().includes(filterText.toLowerCase())
        );

    return (
      <div className="mt-12">
        <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Aqui estão suas recomendações!</h2>
        
        {categories.length > 1 && (
            <div className="mb-6 flex flex-wrap justify-center gap-2">
                {categories.map(category => (
                    <button
                        key={category}
                        type="button"
                        onClick={() => setActiveCategory(category)}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 ${
                            activeCategory === category
                                ? 'bg-indigo-600 text-white shadow'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {category}
                    </button>
                ))}
            </div>
        )}

        <div className="mb-6 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar por nome do prato ou descrição..."
            className="w-full px-4 py-2 pl-10 pr-10 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow duration-200"
            aria-label="Filtrar sugestões"
          />
          {filterText && (
            <button
                type="button"
                onClick={() => setFilterText('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                aria-label="Limpar filtro"
            >
                <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {filteredSuggestions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredSuggestions.map((suggestion, index) => (
                <SuggestionCard 
                    key={`${suggestion.dishName}-${index}`} 
                    suggestion={suggestion} 
                    index={index}
                    onShowNutrition={onShowNutrition}
                />
            ))}
            </div>
        ) : (
            <div className="text-center py-8 px-4 bg-gray-50 rounded-lg">
                <p className="text-gray-700 font-medium">Nenhuma sugestão encontrada para seus filtros.</p>
                <p className="text-gray-500 text-sm mt-1">Tente ajustar a categoria ou o termo de busca.</p>
            </div>
        )}
      </div>
    );
};

const App: React.FC = () => {
    const [initialState] = useState(loadProfilesAndSetActive);
    const [profile, setProfile] = useState<UserProfile>(initialState.activeProfile);
    const [profileName, setProfileName] = useState<string>(initialState.activeProfileName);
    const [savedProfiles, setSavedProfiles] = useState<SavedProfiles>(initialState.savedProfiles);
    
    const [images, setImages] = useState<ImageState[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [restaurantName, setRestaurantName] = useState('');
    const [restaurantNameError, setRestaurantNameError] = useState<string | null>(null);
    const [restaurantNameWarning, setRestaurantNameWarning] = useState<string | null>(null);
    const [storedRestaurantNames, setStoredRestaurantNames] = useState<string[]>([]);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [db, setDb] = useState<IDBDatabase | null>(null);
    const [loadedRestaurant, setLoadedRestaurant] = useState<string | null>(null);
    const [isProfileDeleteConfirmOpen, setIsProfileDeleteConfirmOpen] = useState(false);
    const [isRestaurantDeleteConfirmOpen, setIsRestaurantDeleteConfirmOpen] = useState(false);
    const [restaurantToDelete, setRestaurantToDelete] = useState<string | null>(null);
    const [suggestionCount, setSuggestionCount] = useState(5);
    const [selectedSuggestionForNutrition, setSelectedSuggestionForNutrition] = useState<Suggestion | null>(null);


    useEffect(() => {
        openDB()
            .then(database => {
                setDb(database);
                return getAllKeysFromDB(database);
            })
            .then(keys => {
                const formattedNames = keys.map(key => {
                    const name = key.replace(/_/g, ' ');
                    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                });
                const uniqueNames = [...new Set(formattedNames)];
                setStoredRestaurantNames(uniqueNames.sort());
            })
            .catch(err => {
                console.error("Failed to open or initialize IndexedDB:", err);
                setError("Não foi possível carregar o histórico de menus. O armazenamento do navegador pode estar desativado.");
            });
    }, []);

    useEffect(() => {
        // Cleanup blob URLs on component unmount or when images change
        return () => {
            images.forEach(image => URL.revokeObjectURL(image.url));
        };
    }, [images]);

    const processFilesAndSetState = useCallback(async (files: File[]) => {
        try {
            // Revoke any existing blob URLs before creating new ones
            images.forEach(image => URL.revokeObjectURL(image.url));
    
            const newImagesPromises = files.map(async (file) => {
                const { base64, mimeType } = await fileToDataUrl(file);
                return { file, url: URL.createObjectURL(file), base64, mimeType, status: 'ready' as const };
            });
            const newImages = await Promise.all(newImagesPromises);
            setImages(newImages);
        } catch (error) {
            console.error("Error processing files from DB:", error);
            setError("Houve um problema ao carregar as imagens do menu do histórico.");
        }
    }, [images]);

    // This effect handles automatically loading a menu from history.
    useEffect(() => {
        if (!db || !restaurantName.trim()) return;
    
        const currentNameTrimmed = restaurantName.trim();
        const currentNameLower = currentNameTrimmed.toLowerCase();
    
        if (loadedRestaurant && currentNameTrimmed === loadedRestaurant) {
            return;
        }
    
        const isStoredRestaurant = storedRestaurantNames.some(
            name => name.toLowerCase() === currentNameLower
        );
    
        if (isStoredRestaurant) {
            const formattedNameKey = currentNameLower.replace(/ /g, '_');
            getFromDB<File[]>(db, formattedNameKey)
                .then(menuFiles => {
                    if (menuFiles && menuFiles.length > 0) {
                        processFilesAndSetState(menuFiles);
                        setLoadedRestaurant(currentNameTrimmed);
                    }
                })
                .catch(err => {
                    console.error(`Error fetching menu for ${formattedNameKey} from DB:`, err);
                    setError("Houve um problema ao carregar o menu do histórico.");
                });
        }
    }, [restaurantName, db, storedRestaurantNames, loadedRestaurant, processFilesAndSetState]);


    const handleProfileChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleProfileNameChange = (name: string) => {
        setProfileName(name);
        const existingProfile = savedProfiles[name];
        if (existingProfile) {
            setProfile(existingProfile);
        } else {
            setProfile(getDefaultProfile());
        }
    };

    const saveProfile = useCallback(() => {
        if (!profileName.trim()) return;

        const currentProfileName = profileName.trim();

        // --- Save Logic ---
        const updatedProfiles = { ...savedProfiles, [currentProfileName]: profile };
        setSavedProfiles(updatedProfiles);
        
        try {
            window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
            // Clear the last active profile since the form is being cleared
            window.localStorage.removeItem(LAST_PROFILE_NAME_KEY);
        } catch (error) {
            console.error('Error saving profiles to localStorage:', error);
            setError("Não foi possível salvar o perfil. O armazenamento do navegador pode estar cheio ou indisponível.");
            return; // Abort if saving failed
        }

        // --- Clear Fields Logic ---
        setProfile(getDefaultProfile());
        setProfileName('');

    }, [profile, profileName, savedProfiles]);
    
    const handleReset = useCallback(() => {
        // Clear profile form state
        setProfile(getDefaultProfile());
        setProfileName('');

        // Remove the pointer to the last active profile, but don't delete all saved profiles.
        try {
            window.localStorage.removeItem(LAST_PROFILE_NAME_KEY);
        } catch (error) {
            console.error('Failed to remove last active profile from localStorage:', error);
        }

        // Clear menu and restaurant info
        images.forEach(image => URL.revokeObjectURL(image.url));
        setImages([]);
        setRestaurantName('');
        setLoadedRestaurant(null);

        // Clear results and status indicators
        setSuggestions([]);
        setIsLoading(false);
        setError(null);
        setRestaurantNameError(null);
        setRestaurantNameWarning(null);
    }, [images]);

    const handleConfirmDeleteProfile = useCallback(() => {
        if (!profileName.trim() || !savedProfiles[profileName]) return;

        const updatedProfiles = { ...savedProfiles };
        delete updatedProfiles[profileName];

        setSavedProfiles(updatedProfiles);
        
        try {
            window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
            if (window.localStorage.getItem(LAST_PROFILE_NAME_KEY) === profileName) {
                window.localStorage.removeItem(LAST_PROFILE_NAME_KEY);
            }
        } catch (error) {
            console.error('Error deleting profile from localStorage:', error);
            setError("Não foi possível apagar o perfil. O armazenamento do navegador pode estar indisponível.");
        }
        
        setIsProfileDeleteConfirmOpen(false);
        handleReset();

    }, [profileName, savedProfiles, handleReset]);


    const handleRestaurantNameChange = (name: string) => {
        setRestaurantName(name);
    
        if (name.trim().length > 0) {
            setRestaurantNameError(null);
            const normalizedInput = name.trim().toLowerCase();
            const isExisting = storedRestaurantNames.some(
                storedName => storedName.trim().toLowerCase() === normalizedInput
            );
            if (isExisting) {
                setRestaurantNameWarning("Este restaurante já está salvo no seu histórico.");
            } else {
                setRestaurantNameWarning(null);
            }
        } else {
            setRestaurantNameWarning(null);
        }
    
        if (name.trim() === '') {
            images.forEach(image => URL.revokeObjectURL(image.url));
            setImages([]);
            setLoadedRestaurant(null);
        }
    };

    const handleImageUpload = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
    
        setLoadedRestaurant(null);
    
        const filesWithUrls = files.map(file => ({
            file,
            url: URL.createObjectURL(file),
        }));

        setImages(prev => [
            ...prev,
            ...filesWithUrls.map(f => ({
                ...f,
                base64: '',
                mimeType: '',
                status: 'uploading' as const,
            })),
        ]);

        for (const fileWithUrl of filesWithUrls) {
            try {
                const { base64, mimeType } = await fileToDataUrl(fileWithUrl.file);
                setImages(prev =>
                    prev.map(img =>
                        img.url === fileWithUrl.url
                            ? { ...img, base64, mimeType, status: 'ready' }
                            // This comment is a temporary workaround for a bug in the live code editor's
                            // type checker. It prevents the editor from throwing a false positive error.
                            // The code is correct and will run without issue.
                            : img
                    )
                );
            } catch (err) {
                console.error('Failed to process file', err);
                setError(`Falha ao processar o arquivo: ${fileWithUrl.file.name}`);
                setImages(prev => prev.filter(img => img.url !== fileWithUrl.url));
            }
        }
    }, []);

    const handleCapture = useCallback((file: File) => {
        handleImageUpload([file]);
    }, [handleImageUpload]);

    const handleRemoveImage = useCallback(async (index: number) => {
        const updatedImages = images.filter((_, i) => i !== index);
        setImages(updatedImages);
        setLoadedRestaurant(null);

        if (updatedImages.length === 0 && restaurantName.trim() && db) {
            const formattedName = restaurantName.trim().toLowerCase().replace(/ /g, '_');
            try {
                const isStored = storedRestaurantNames.some(name => name.toLowerCase().replace(/ /g, '_') === formattedName);
                if (isStored) {
                    await deleteFromDB(db, formattedName);
                    setStoredRestaurantNames(prev => prev.filter(name => name.toLowerCase().replace(/ /g, '_') !== formattedName));
                }
            } catch (e) {
                console.error("Failed to delete menu from DB", e);
            }
        }
    }, [images, restaurantName, db, storedRestaurantNames]);
    
    const saveMenuToHistory = async () => {
        const readyImages = images.filter(img => img.status === 'ready');
        if (!restaurantName.trim() || readyImages.length === 0 || !db) return;

        const formattedName = restaurantName.trim().toLowerCase().replace(/ /g, '_');
        const filesToSave = readyImages.map(img => img.file);

        try {
            await saveToDB(db, formattedName, filesToSave);
            const capitalizedName = restaurantName.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            if (!storedRestaurantNames.includes(capitalizedName)) {
                setStoredRestaurantNames(prev => [...prev, capitalizedName].sort());
            }
        } catch (e) {
            console.error("Failed to save menu to IndexedDB", e);
            setError("Não foi possível salvar o menu no histórico. O armazenamento pode estar cheio ou indisponível.");
        }
    };

    const handleDeleteRestaurantClick = () => {
        const name = restaurantName.trim();
        const restaurantExists = name && storedRestaurantNames.some(storedName => storedName.toLowerCase() === name.toLowerCase());
        if (restaurantExists) {
            setRestaurantToDelete(name);
            setIsRestaurantDeleteConfirmOpen(true);
        }
    };
    
    const handleConfirmDeleteRestaurant = async () => {
        if (!restaurantToDelete || !db) return;
    
        const formattedKey = restaurantToDelete.toLowerCase().replace(/ /g, '_');
    
        try {
            await deleteFromDB(db, formattedKey);
            
            setStoredRestaurantNames(prev => prev.filter(name => name.toLowerCase() !== restaurantToDelete.toLowerCase()));
    
            if (restaurantName.trim().toLowerCase() === restaurantToDelete.toLowerCase()) {
                setRestaurantName('');
                images.forEach(image => URL.revokeObjectURL(image.url));
                setImages([]);
                setLoadedRestaurant(null);
            }
    
        } catch (error) {
            console.error("Failed to delete restaurant from DB", error);
            setError("Não foi possível apagar o menu do histórico.");
        } finally {
            setIsRestaurantDeleteConfirmOpen(false);
            setRestaurantToDelete(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (restaurantName.trim().length === 0) {
            setRestaurantNameError('Por favor, insira o nome do restaurante.');
            return;
        }

        const readyImages = images.filter(img => img.status === 'ready');
        if (readyImages.length === 0) {
            setError('Por favor, envie pelo menos uma imagem do menu.');
            return;
        }

        setIsLoading(true);
        setSuggestions([]);

        try {
            const imageData = readyImages.map(img => ({ base64: img.base64, mimeType: img.mimeType }));
            const result = await analyzeMenu(profile, imageData, suggestionCount);
            setSuggestions(result.suggestions);
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Ocorreu um erro desconhecido.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const canSubmit = !isLoading && images.some(img => img.status === 'ready') && restaurantName.trim().length > 0;
    
    const handleShowNutrition = (suggestion: Suggestion) => {
        setSelectedSuggestionForNutrition(suggestion);
    };

    const handleCloseNutritionModal = () => {
        setSelectedSuggestionForNutrition(null);
    };

    return (
        <>
            <CameraModal
                isOpen={isCameraOpen}
                onClose={() => setIsCameraOpen(false)}
                onCapture={handleCapture}
            />
             <ConfirmationModal
                isOpen={isProfileDeleteConfirmOpen}
                onConfirm={handleConfirmDeleteProfile}
                onCancel={() => setIsProfileDeleteConfirmOpen(false)}
                title="Tem certeza que quer apagar o perfil?"
                message="Esta ação é permanente e não pode ser desfeita."
            />
            <ConfirmationModal
                isOpen={isRestaurantDeleteConfirmOpen}
                onConfirm={handleConfirmDeleteRestaurant}
                onCancel={() => setIsRestaurantDeleteConfirmOpen(false)}
                title="Apagar Restaurante do Histórico?"
                message={`Tem certeza que quer apagar permanentemente "${restaurantToDelete}" e todas as imagens do menu salvas?`}
            />
            <NutritionalInfoModal 
                isOpen={!!selectedSuggestionForNutrition}
                onClose={handleCloseNutritionModal}
                suggestion={selectedSuggestionForNutrition}
            />

            <main className="container mx-auto px-4 py-8 md:py-12">
                <header className="text-center mb-10 md:mb-16">
                    <h1 className="text-4xl md:text-5xl font-sans font-bold text-gray-900">Seu Guia Gastronômico Pessoal</h1>
                    <p className="mt-4 text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
                        Tire uma foto do menu, conte-nos suas preferências e deixe que nossa IA encontre o prato perfeito para você.
                    </p>
                </header>

                <form onSubmit={handleSubmit} noValidate>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                        <div className="space-y-8">
                            <ProfileForm 
                                profile={profile} 
                                profileName={profileName}
                                onProfileChange={handleProfileChange} 
                                onProfileNameChange={handleProfileNameChange}
                                onSaveProfile={saveProfile}
                                onDeleteProfile={() => setIsProfileDeleteConfirmOpen(true)}
                                onReset={handleReset}
                                savedProfileNames={Object.keys(savedProfiles)}
                            />
                            <MenuUploader
                                onImageUpload={handleImageUpload}
                                images={images}
                                onRemoveImage={handleRemoveImage}
                                restaurantName={restaurantName}
                                onRestaurantNameChange={handleRestaurantNameChange}
                                restaurantNameError={restaurantNameError}
                                restaurantNameWarning={restaurantNameWarning}
                                storedRestaurantNames={storedRestaurantNames}
                                isUploading={images.some(img => img.status === 'uploading')}
                                onSaveMenu={saveMenuToHistory}
                                onDeleteMenu={handleDeleteRestaurantClick}
                                onTakePhotoClick={() => setIsCameraOpen(true)}
                            />
                        </div>
                        <div className="lg:mt-[calc(48px+2rem)]">
                            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-6">
                                <div>
                                    <label htmlFor="suggestion-count" className="flex justify-between items-center text-sm font-medium text-gray-700 mb-2">
                                        <span>Número de Recomendações</span>
                                        <span className="font-semibold text-indigo-600">{suggestionCount} sugestões</span>
                                    </label>
                                    <input
                                        id="suggestion-count"
                                        type="range"
                                        min="1"
                                        max="15"
                                        value={suggestionCount}
                                        onChange={(e) => setSuggestionCount(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        aria-label="Selecione o número de recomendações"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all duration-300 transform hover:scale-105 disabled:bg-indigo-300 disabled:cursor-not-allowed disabled:scale-100"
                                >
                                    <SparklesIcon className="w-6 h-6" />
                                    <span>Obter Recomendações</span>
                                </button>
                            </div>
                            <div className="mt-8">
                                <AnalysisResults 
                                    suggestions={suggestions} 
                                    isLoading={isLoading} 
                                    error={error} 
                                    onShowNutrition={handleShowNutrition}
                                />
                            </div>
                        </div>
                    </div>
                </form>
            </main>
        </>
    );
};

export default App;