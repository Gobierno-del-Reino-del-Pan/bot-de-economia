const config = require('../config.json');

// =============================================
// Sistema de Moneda y Formateo
// =============================================

class CurrencyHelper {
  static format(amount) {
    return `${amount.toLocaleString()} ${config.currency.emoji}`;
  }

  static parseAmount(input, userCash, userBank = null) {
    if (!input) return null;

    const inputLower = input.toLowerCase();
    
    if (inputLower === 'todo' || inputLower === 'all') {
      return userCash;
    }
    
    if (inputLower === 'half' || inputLower === 'mitad') {
      return Math.floor(userCash / 2);
    }

    // Para comandos de banco, permitir retirar del banco
    if (userBank !== null) {
      if (inputLower === 'bank' || inputLower === 'banco') {
        return userBank;
      }
      if (inputLower === 'bankall' || inputLower === 'bancotodo') {
        return userBank;
      }
    }

    const amount = parseInt(input);
    if (isNaN(amount) || amount <= 0) {
      return null;
    }

    return amount;
  }

  static validateAmount(amount, min, max) {
    if (amount < min || amount > max) {
      return false;
    }
    return true;
  }

  static generateShortId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

module.exports = CurrencyHelper;