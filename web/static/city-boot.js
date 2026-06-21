import {
  disposeKnowledgeCity,
  initKnowledgeCity,
  resizeKnowledgeCity,
} from "./city3d.js?v=7";

window.KnowledgeCity = {
  async open(options) {
    return initKnowledgeCity(options);
  },
  resize(canvas) {
    resizeKnowledgeCity(canvas);
  },
  close() {
    disposeKnowledgeCity();
  },
};

window.dispatchEvent(new Event("knowledge-city-ready"));
