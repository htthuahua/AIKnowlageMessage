import {
  disposeKnowledgeCity,
  initKnowledgeCity,
  resizeKnowledgeCity,
} from "./city3d.js";

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
