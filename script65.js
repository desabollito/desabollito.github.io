var encuestasServices = angular.module('encuestaServices', ['app.services']);

encuestasServices.factory('Encuesta', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/encuesta', false, {
            obtener: { method: 'POST', url: 'api/encuesta/obtener' },
            guardar: { method: 'POST', url: 'api/encuesta/guardar' }
        });
    }]);