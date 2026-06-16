import styles from './Popups.module.css';

export function ErrorPopup({text, closeSelf}){  
  return (
    text &&
    <div className={styles.backgroundFill}>
      <div className={styles.popupErrorWindow}>
        <p>{text}</p>
        <button className={styles.acceptErrorButton} onClick={() => closeSelf()}>OK</button>
      </div>
    </div>
  );
}