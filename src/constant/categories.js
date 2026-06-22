export const EVENT_CATEGORIES = [
    { id: 'music', name: 'Music', icon: 'fi-rr-music-alt' },
    { id: 'tech', name: 'Technology', icon: 'fi-rr-computer' },
    { id: 'sports', name: 'Sports', icon: 'fi-rr-basketball' },
    { id: 'arts', name: 'Arts & Theater', icon: 'fi-rr-paint-brush' },
    { id: 'food', name: 'Food & Drink', icon: 'fi-rr-restaurant' },
    { id: 'business', name: 'Business', icon: 'fi-rr-briefcase' },
    { id: 'workshop', name: 'Workshop', icon: 'fi-rr-chalkboard-user' },
    { id: 'health', name: 'Health & Wellness', icon: 'fi-rr-heart' },
    { id: 'comedy', name: 'Comedy', icon: 'fi-rr-smile' },
    { id: 'education', name: 'Education', icon: 'fi-rr-graduation-cap' },
    { id: 'gaming', name: 'Gaming', icon: 'fi-rr-gamepad' },
    { id: 'fashion', name: 'Fashion', icon: 'fi-rr-shopping-bag' },
    { id: 'networking', name: 'Networking', icon: 'fi-rr-users' },
    { id: 'other', name: 'Other', icon: 'fi-rr-apps' }
];

export const getCategoryName = (id) => {
    const category = EVENT_CATEGORIES.find(cat => cat.id === id);
    return category ? category.name : 'Uncategorized';
};

export const getCategoryIcon = (id) => {
    const category = EVENT_CATEGORIES.find(cat => cat.id === id);
    return category ? category.icon : 'fi-rr-apps';
};
