var formulario08DServices = angular.module('formulario08DServices', ['app.services']);

formulario08DServices.factory('Formulario08D', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/formulario/08', true, {
            recuperar: { method: 'GET', url: 'api/formulario/08/:nroPrecarga/:cuit', params: { nroPrecarga: '@nroPrecarga', cuit: '@cuit' } }
        });
    }]);